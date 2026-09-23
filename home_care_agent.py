#!/usr/bin/env python3
"""
home_care_agent.py — a local SEO and AI-visibility audit for a home care agency.

    python home_care_agent.py "Agency Name" "https://agency-url.com" "City, ST ZIP"

This is the home care sibling of the senior living tool in this repo. A home care agency
is a *service-area business*: caregivers go to the client, so there is no community to
tour and often no public street address. That single difference reshapes the audit —
"your address is missing" is normal here rather than a fault, while "which towns do you
cover" is the most important thing on the whole website and the thing agencies most often
leave implicit.

It scores out of 100 across five areas (Google listing 25, directory listings 20,
website 25, reviews 15, AI search readiness 15) and prints a plain-language fix list
ordered by how many points each item is worth.

Two rules it keeps from the senior living PRD, because they are what make a score
trustworthy:

  * Absence of evidence is not evidence of absence. Anything we could not see is reported
    "couldn't check" and its points leave the denominator — never counted as a zero. A
    score out of what we could check says so out loud.
  * robots.txt is obeyed, every fetch is cached for 24 hours, and failures retry with
    backoff instead of taking the audit down with them.

API keys are optional. With none, it still audits the website and AI readiness honestly
and tells you which areas went unscored. It reads GOOGLE_PLACES_API_KEY, SERPER_API_KEY,
YELP_API_KEY and PAGESPEED_API_KEY from the environment or a .env in the working
directory, and never prints their values.

Dependencies: requests (falls back to urllib if absent), and playwright is used when it
is installed — many agency sites render their content with JavaScript.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

try:  # Preferred: better redirect, timeout and TLS behaviour than urllib.
    import requests  # type: ignore
except ImportError:  # pragma: no cover - exercised only on a bare interpreter
    requests = None  # type: ignore

VERSION = "1.0"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 HomeCareAuditBot/1.0"
)
CACHE_DIR = os.path.join(".cache", "home_care_agent")
CACHE_TTL_SECONDS = 24 * 60 * 60
MAX_PAGES = 9
FETCH_TIMEOUT = 25
RETRIES = 3

# How much of an area has to be readable before we will put a score on the whole of it.
# See Module.is_scorable.
MIN_VISIBLE_FRACTION = 0.5

# --------------------------------------------------------------------------------------
# Vocabulary
#
# Home care has its own words, and they are not the senior living ones. "Assisted living"
# on a home care site is usually a page explaining the difference, not a service. What an
# agency actually sells is hours of help in someone's own home.
# --------------------------------------------------------------------------------------

SERVICE_TERMS: Dict[str, Sequence[str]] = {
    "Companion care": ("companion care", "companionship", "social care"),
    "Personal care": ("personal care", "bathing", "grooming", "toileting", "incontinence", "hygiene assistance"),
    "Dementia and Alzheimer's care": ("dementia", "alzheimer", "memory care at home", "cognitive"),
    "Respite care": ("respite",),
    "24-hour and live-in care": ("24-hour", "24 hour care", "live-in", "live in care", "overnight care", "around-the-clock"),
    "Post-hospital care": ("post-hospital", "post hospital", "transitional care", "after surgery", "hospital to home", "discharge"),
    "End-of-life support": ("end-of-life", "end of life", "hospice support", "palliative"),
    "Veterans care": ("veteran", "va benefits", "aid and attendance", "aid & attendance"),
}

PAYMENT_TERMS: Dict[str, Sequence[str]] = {
    "private pay": ("private pay", "out of pocket", "self pay", "self-pay"),
    "long-term care insurance": ("long-term care insurance", "long term care insurance", "ltc insurance", "ltci"),
    "Medicaid": ("medicaid", "waiver program", "medicaid waiver"),
    "VA benefits": ("va benefit", "veterans affairs", "aid and attendance", "aid & attendance"),
}

TRUST_TERMS: Sequence[str] = (
    "licensed",
    "bonded",
    "insured",
    "background check",
    "background-check",
    "screened",
    "cna",
    "certified nursing assistant",
    "home health aide",
    "state license",
)

COST_TERMS: Sequence[str] = ("cost", "pricing", "rates", "hourly rate", "how much", "price", "fees")

# Pages worth going and finding, and the words that give them away in a link.
PAGE_TARGETS: Dict[str, Sequence[str]] = {
    "services": ("service", "care we provide", "what we do", "home care services", "our care"),
    "areas": ("area", "location", "cities", "communities we serve", "service area", "where we serve", "coverage"),
    "contact": ("contact", "get in touch", "reach us", "request care", "free assessment", "consultation"),
    "about": ("about", "our story", "who we are", "our team", "mission"),
    "careers": ("career", "job", "employment", "join our team", "hiring", "caregiver application", "work for us", "become a caregiver"),
    "cost": ("cost", "pricing", "rates", "payment", "paying for", "insurance", "how to pay"),
    "faq": ("faq", "frequently asked", "questions", "resources"),
    "reviews": ("review", "testimonial", "what families say", "client stories"),
    "blog": ("blog", "news", "articles", "resource center"),
}

LOCALBUSINESS_TYPES = {
    "localbusiness",
    "homehealthcarebusiness",
    "homeandconstructionbusiness",
    "medicalbusiness",
    "medicalorganization",
    "healthandbeautybusiness",
    "professionalservice",
    "organization",
    "nursinghome",
    "physician",
}

PHONE_RE = re.compile(r"(?:\+?1[\s.\-]?)?\(?\b\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b")
# The +4 is captured so it can be discarded whole. Matching only the five digits left
# "-2201" behind, and parse_location then read that as the city name.
ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")
STATE_RE = re.compile(r"\b([A-Z]{2})\b")
QUESTION_WORDS = ("how ", "what ", "why ", "when ", "where ", "who ", "which ", "do i ", "does ", "can ", "is ", "are ")

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}

# The directories that matter for home care. Not the same list as senior living: families
# looking for in-home help land on Caring.com and A Place for Mom, but also on the general
# service directories, and Medicare.gov only lists *home health* agencies, so a non-medical
# agency being absent there is not a fault.
DIRECTORIES: Sequence[Tuple[str, str, float]] = (
    ("Google Business Profile", "google.com/maps", 0.0),  # scored in its own module
    ("Yelp", "yelp.com", 3.0),
    ("Caring.com", "caring.com", 3.0),
    ("A Place for Mom", "aplaceformom.com", 2.0),
    ("Better Business Bureau", "bbb.org", 2.5),
    ("Facebook", "facebook.com", 2.5),
    ("Angi", "angi.com", 2.0),
    ("YellowPages", "yellowpages.com", 2.0),
    ("Apple Maps", "maps.apple.com", 1.5),
    ("Bing Places", "bing.com/maps", 1.5),
)

# --------------------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------------------


def log(message: str, quiet: bool = False) -> None:
    if not quiet:
        sys.stderr.write("  %s\n" % message)
        sys.stderr.flush()


def load_dotenv() -> None:
    """Read a .env from the working directory into os.environ without overwriting it.

    Values are never logged or printed anywhere in this program: only whether a key is
    present, and what its absence means for the score.
    """
    for candidate in (".env", os.path.join("..", ".env")):
        if not os.path.isfile(candidate):
            continue
        try:
            with open(candidate, "r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    name, _, value = line.partition("=")
                    name, value = name.strip(), value.strip().strip("'\"")
                    if name and value and name not in os.environ:
                        os.environ[name] = value
        except OSError:
            pass
        return


def cache_path(kind: str, key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return os.path.join(CACHE_DIR, kind, "%s.json" % digest)


def cache_read(kind: str, key: str, ttl: int = CACHE_TTL_SECONDS) -> Optional[Any]:
    path = cache_path(kind, key)
    try:
        if time.time() - os.path.getmtime(path) > ttl:
            return None
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def cache_write(kind: str, key: str, payload: Any) -> None:
    path = cache_path(kind, key)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
    except (OSError, TypeError):
        pass


def normalize_url(raw: str) -> Tuple[str, Optional[str]]:
    """Return (url, a note about anything we assumed).

    A bare host gets https. A mistyped scheme is repaired here rather than handed to the
    HTTP layer, which answers a typed "ttps://" with "No connection adapters were found" —
    a true statement about an internal detail, and no help at all to whoever typed it.
    """
    text = (raw or "").strip().strip('"\'')
    match = re.match(r"^([A-Za-z][A-Za-z0-9+.\-]*)://(.*)$", text)
    if not match:
        return "https://" + text.lstrip("/"), None
    scheme, rest = match.group(1).lower(), match.group(2)
    if scheme in ("http", "https"):
        return text, None
    if scheme in ("ttp", "ttps", "tps", "tp", "htp", "htps", "hhtp", "hhtps", "ttpss", "hptts"):
        return "https://" + rest, "Read \"%s://\" as \"https://\"." % scheme
    return text, None


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:] if len(digits) >= 10 else digits


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def truncate(text: str, limit: int) -> str:
    text = squash(text)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "\u2026"


def plural(count: int, singular: str, many: Optional[str] = None) -> str:
    return "%d %s" % (count, singular if count == 1 else (many or singular + "s"))


# --------------------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------------------


@dataclass
class Response:
    status: int
    text: str
    url: str
    elapsed_ms: int
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300 and bool(self.text)


def describe_network_error(error: BaseException) -> str:
    """A sentence an operator can act on, in place of the exception's own words.

    `str()` on a requests failure is the whole urllib3 chain — "HTTPSConnectionPool(host=...,
    port=443): Max retries exceeded with url: / (Caused by NameResolutionError(...))". Every
    word of it is true and none of it tells whoever typed the address that they misspelled
    the domain. The raw text is kept nowhere the operator sees; the class names in the chain
    are what we read, since requests nests the real cause inside its own wrapper.
    """
    trail = repr(error)
    cause = error.__cause__ or error.__context__
    if cause is not None:
        trail += " " + repr(cause)

    if "NameResolution" in trail or "gaierror" in trail or "getaddrinfo" in trail:
        return "that web address does not exist"
    if "SSL" in trail or "Certificate" in trail or "CERTIFICATE" in trail:
        return "the site's security certificate could not be verified"
    if "ConnectTimeout" in trail or "ReadTimeout" in trail or "Timeout" in trail:
        return "the site did not answer within %d seconds" % FETCH_TIMEOUT
    if "TooManyRedirects" in trail:
        return "the site kept redirecting and never settled on a page"
    if "ConnectionRefused" in trail or "NewConnectionError" in trail:
        return "the server refused the connection"
    if "InvalidURL" in trail or "MissingSchema" in trail or "InvalidSchema" in trail:
        return "that does not look like a web address"
    if "ConnectionError" in trail or "ProtocolError" in trail or "ConnectionReset" in trail:
        return "the connection to the site broke partway through"
    return "the site could not be reached"


def http_get(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = FETCH_TIMEOUT,
    retries: int = RETRIES,
) -> Response:
    """GET with exponential backoff.

    A 4xx other than 429 is not retried: the answer will not change on a second ask, and
    an audit that hammers an agency's website is not a good citizen.
    """
    all_headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    all_headers.update(headers or {})
    last: Optional[Response] = None

    for attempt in range(retries):
        started = time.time()
        try:
            if requests is not None:
                reply = requests.get(url, headers=all_headers, timeout=timeout, allow_redirects=True)
                last = Response(reply.status_code, reply.text, reply.url, int((time.time() - started) * 1000))
            else:
                req = urlrequest.Request(url, headers=all_headers)
                with urlrequest.urlopen(req, timeout=timeout) as reply:  # nosec - audited URL
                    body = reply.read().decode(reply.headers.get_content_charset() or "utf-8", "replace")
                    last = Response(reply.status, body, reply.geturl(), int((time.time() - started) * 1000))
        except urlerror.HTTPError as error:  # urllib path
            body = ""
            try:
                body = error.read().decode("utf-8", "replace")
            except Exception:
                pass
            last = Response(error.code, body, url, int((time.time() - started) * 1000), str(error))
        except Exception as error:  # requests exceptions, TLS, DNS, timeouts
            last = Response(0, "", url, int((time.time() - started) * 1000), describe_network_error(error))

        if last.ok:
            return last
        if last.status and last.status < 500 and last.status != 429:
            return last
        if last.error == "that web address does not exist":
            return last  # a domain that does not exist will not exist in 4.5 seconds either
        if attempt < retries - 1:
            time.sleep(1.5 * (2 ** attempt))

    return last or Response(0, "", url, 0, "no attempt made")


def http_post_json(url: str, payload: Dict[str, Any], headers: Dict[str, str], timeout: int = FETCH_TIMEOUT) -> Optional[Any]:
    body = json.dumps(payload).encode("utf-8")
    all_headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
    all_headers.update(headers)
    for attempt in range(RETRIES):
        try:
            if requests is not None:
                reply = requests.post(url, data=body, headers=all_headers, timeout=timeout)
                if reply.status_code == 429 and attempt < RETRIES - 1:
                    time.sleep(1.5 * (2 ** attempt))
                    continue
                if not reply.ok:
                    return None
                return reply.json()
            req = urlrequest.Request(url, data=body, headers=all_headers, method="POST")
            with urlrequest.urlopen(req, timeout=timeout) as reply:  # nosec
                return json.loads(reply.read().decode("utf-8", "replace"))
        except Exception:
            if attempt < RETRIES - 1:
                time.sleep(1.5 * (2 ** attempt))
    return None


# --------------------------------------------------------------------------------------
# HTML parsing (stdlib only — no BeautifulSoup to install)
# --------------------------------------------------------------------------------------

SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "iframe"}


class Extractor(HTMLParser):
    def __init__(self) -> None:
        HTMLParser.__init__(self, convert_charrefs=True)
        self.title = ""
        self.meta: Dict[str, str] = {}
        self.headings: List[Tuple[int, str]] = []
        self.links: List[Tuple[str, str]] = []
        self.jsonld: List[str] = []
        self.iframes: List[str] = []
        self.images = 0
        self.images_with_alt = 0
        self.forms = 0
        self.tel_links: List[str] = []
        self.mailto = 0
        self.has_viewport = False
        self.text_parts: List[str] = []
        self._skip_depth = 0
        self._in_title = False
        self._in_jsonld = False
        self._heading: Optional[Tuple[int, List[str]]] = None
        self._link: Optional[Tuple[str, List[str]]] = None

    # -- tags -------------------------------------------------------------------------
    def handle_starttag(self, tag: str, attrs_list: Sequence[Tuple[str, Optional[str]]]) -> None:
        attrs = {k.lower(): (v or "") for k, v in attrs_list}
        if tag in SKIP_TAGS:
            if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
                self._in_jsonld = True
                self.jsonld.append("")
            if tag == "iframe" and attrs.get("src"):
                self.iframes.append(attrs["src"])
            self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = (attrs.get("name") or attrs.get("property") or "").lower()
            if name:
                self.meta[name] = attrs.get("content", "")
            if name == "viewport":
                self.has_viewport = True
        elif tag in ("h1", "h2", "h3", "h4"):
            self._heading = (int(tag[1]), [])
        elif tag == "a":
            href = attrs.get("href", "")
            if href.lower().startswith("tel:"):
                self.tel_links.append(href[4:])
            elif href.lower().startswith("mailto:"):
                self.mailto += 1
            self._link = (href, [])
        elif tag == "img":
            self.images += 1
            if squash(attrs.get("alt", "")):
                self.images_with_alt += 1
        elif tag == "form":
            self.forms += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            if tag == "script":
                self._in_jsonld = False
            return
        if tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2", "h3", "h4") and self._heading:
            level, parts = self._heading
            text = squash("".join(parts))
            if text:
                self.headings.append((level, text))
            self._heading = None
        elif tag == "a" and self._link:
            href, parts = self._link
            self.links.append((href, squash("".join(parts))))
            self._link = None

    def handle_data(self, data: str) -> None:
        if self._in_jsonld and self.jsonld:
            self.jsonld[-1] += data
            return
        if self._skip_depth:
            return
        if self._in_title:
            self.title += data
        if self._heading:
            self._heading[1].append(data)
        if self._link:
            self._link[1].append(data)
        if squash(data):
            self.text_parts.append(data)


@dataclass
class Page:
    url: str
    status: int
    title: str = ""
    meta: Dict[str, str] = field(default_factory=dict)
    headings: List[Tuple[int, str]] = field(default_factory=list)
    links: List[Tuple[str, str]] = field(default_factory=list)
    text: str = ""
    jsonld: List[Any] = field(default_factory=list)
    iframes: List[str] = field(default_factory=list)
    tel_links: List[str] = field(default_factory=list)
    forms: int = 0
    images: int = 0
    images_with_alt: int = 0
    has_viewport: bool = False
    html_bytes: int = 0
    elapsed_ms: int = 0
    rendered_with: str = "http"
    role: str = ""

    @property
    def h1(self) -> str:
        for level, text in self.headings:
            if level == 1:
                return text
        return ""

    @property
    def lower_text(self) -> str:
        return self.text.lower()


def parse_page(url: str, status: int, html: str, elapsed_ms: int, rendered_with: str) -> Page:
    extractor = Extractor()
    try:
        extractor.feed(html)
        extractor.close()
    except Exception:
        pass  # A malformed page still yields whatever was parsed before the break.

    jsonld: List[Any] = []
    for blob in extractor.jsonld:
        blob = blob.strip()
        if not blob:
            continue
        try:
            jsonld.append(json.loads(blob))
        except ValueError:
            # Sites frequently emit two objects in one tag, or trailing commas.
            for piece in re.findall(r"\{.*?\}(?=\s*[,\]]|\s*$)", blob, re.S)[:5]:
                try:
                    jsonld.append(json.loads(piece))
                except ValueError:
                    continue

    return Page(
        url=url,
        status=status,
        title=squash(unescape(extractor.title)),
        meta={k: squash(v) for k, v in extractor.meta.items()},
        headings=extractor.headings,
        links=extractor.links,
        text=squash(" ".join(extractor.text_parts)),
        jsonld=jsonld,
        iframes=extractor.iframes,
        tel_links=extractor.tel_links,
        forms=extractor.forms,
        images=extractor.images,
        images_with_alt=extractor.images_with_alt,
        has_viewport=extractor.has_viewport,
        html_bytes=len(html.encode("utf-8", "replace")),
        elapsed_ms=elapsed_ms,
        rendered_with=rendered_with,
    )


# --------------------------------------------------------------------------------------
# Fetching, with robots.txt and an optional browser
# --------------------------------------------------------------------------------------


class Fetcher:
    """Fetches pages politely: robots.txt first, 24h cache, browser only when needed."""

    def __init__(self, use_cache: bool = True, use_browser: bool = True, quiet: bool = False) -> None:
        self.use_cache = use_cache
        self.use_browser = use_browser
        self.quiet = quiet
        self.robots: Dict[str, Optional[RobotFileParser]] = {}
        self.blocked: List[str] = []
        self.notes: List[str] = []
        self.last_error: Optional[str] = None
        self._browser: Any = None
        self._playwright: Any = None

    # -- robots -----------------------------------------------------------------------
    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = "%s://%s" % (parsed.scheme, parsed.netloc)
        if origin not in self.robots:
            parser: Optional[RobotFileParser] = RobotFileParser()
            reply = http_get(urljoin(origin, "/robots.txt"), retries=2, timeout=12)
            if reply.ok and "<html" not in reply.text[:400].lower():
                try:
                    parser.parse(reply.text.splitlines())
                except Exception:
                    parser = None
            else:
                # No usable robots.txt means no stated restriction, which is permission.
                parser = None
            self.robots[origin] = parser
        parser = self.robots[origin]
        if parser is None:
            return True
        try:
            return parser.can_fetch(USER_AGENT, url) or parser.can_fetch("*", url)
        except Exception:
            return True

    # -- browser ----------------------------------------------------------------------
    def _render(self, url: str) -> Optional[Tuple[int, str, int]]:
        if not self.use_browser:
            return None
        try:
            from playwright.sync_api import sync_playwright  # type: ignore
        except Exception:
            return None
        try:
            if self._browser is None:
                self._playwright = sync_playwright().start()
                self._browser = self._playwright.chromium.launch(headless=True)
            page = self._browser.new_page(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
            started = time.time()
            reply = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                page.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                pass  # A site with a chat widget never goes idle; what loaded is enough.
            html = page.content()
            status = reply.status if reply else 200
            page.close()
            return status, html, int((time.time() - started) * 1000)
        except Exception as error:
            self.notes.append("The browser could not open %s (%s)." % (url, truncate(str(error), 80)))
            return None

    def close(self) -> None:
        try:
            if self._browser is not None:
                self._browser.close()
            if self._playwright is not None:
                self._playwright.stop()
        except Exception:
            pass

    # -- pages ------------------------------------------------------------------------
    def page(self, url: str) -> Optional[Page]:
        if self.use_cache:
            cached = cache_read("pages", url)
            if cached:
                page = parse_page(cached["url"], cached["status"], cached["html"], cached.get("elapsed_ms", 0), cached.get("rendered_with", "cache"))
                log("cached  %s" % truncate(url, 78), self.quiet)
                return page

        if not self.allowed(url):
            self.blocked.append(url)
            self.last_error = "the site's robots.txt disallows it"
            log("robots  %s (skipped)" % truncate(url, 68), self.quiet)
            return None

        reply = http_get(url)
        html, status, elapsed, how = reply.text, reply.status, reply.elapsed_ms, "http"
        final_url = reply.url or url

        # Two reasons to bring out the browser: we were refused, or we were served a shell
        # with no content in it — which is most of the modern web and nearly every site
        # built on a page builder.
        thin = reply.ok and (len(re.sub(r"<[^>]+>", " ", html)) < 1200 or "<h1" not in html.lower())
        if (not reply.ok or thin) and self.use_browser:
            rendered = self._render(url)
            if rendered and rendered[1]:
                status, html, elapsed = rendered
                how = "browser"

        if not html:
            self.last_error = reply.error or "the server answered %s" % status
            log("failed  %s (%s)" % (truncate(url, 60), self.last_error), self.quiet)
            return None

        if self.use_cache:
            cache_write("pages", url, {"url": final_url, "status": status, "html": html, "elapsed_ms": elapsed, "rendered_with": how})

        log("%-7s %s" % (how, truncate(url, 78)), self.quiet)
        return parse_page(final_url, status, html, elapsed, how)


# --------------------------------------------------------------------------------------
# The audit model
# --------------------------------------------------------------------------------------

PASS, WARN, FAIL, UNAVAILABLE = "pass", "warn", "fail", "unavailable"
QUICK, PROJECT, ONGOING = "quick win", "bigger project", "ongoing"

STATUS_LABEL = {PASS: "Done", WARN: "Partly done", FAIL: "Not done", UNAVAILABLE: "Couldn't check"}
STATUS_COLOR = {PASS: "green", WARN: "yellow", FAIL: "red", UNAVAILABLE: "grey"}
ANSI = {"green": "\033[32m", "yellow": "\033[33m", "orange": "\033[33m", "red": "\033[31m", "grey": "\033[90m", "bold": "\033[1m", "dim": "\033[2m", "reset": "\033[0m"}


@dataclass
class Check:
    id: str
    label: str
    status: str
    max_points: float
    points: float = 0.0
    detail: str = ""
    fix: str = ""
    steps: List[str] = field(default_factory=list)
    effort: str = QUICK
    reason: str = ""  # why it could not be checked

    @property
    def recoverable(self) -> float:
        if self.status == UNAVAILABLE:
            return 0.0
        return round(self.max_points - self.points, 2)


@dataclass
class Module:
    id: str
    label: str
    weight: float
    blurb: str
    checks: List[Check] = field(default_factory=list)

    @property
    def scorable_max(self) -> float:
        return round(sum(c.max_points for c in self.checks if c.status != UNAVAILABLE), 2)

    @property
    def points(self) -> float:
        return round(sum(c.points for c in self.checks if c.status != UNAVAILABLE), 2)

    @property
    def is_scorable(self) -> bool:
        """Whether enough of this area was visible to put a number on the whole of it.

        Scoring a module means projecting what we saw onto its full weight, and that is
        only fair while most of it was visible. With no Google key, the reviews area has
        exactly one readable check — testimonials on the website — and a site that has them
        would otherwise print a full green 15 of 15 for an area where the rating, the
        volume, the recency and the second review site were all unread. That is a stronger
        claim than the evidence supports, so below half visible the module is not scored at
        all and says so, on the same principle as a check that reports "couldn't check".
        """
        return self.scorable_max >= self.weight * MIN_VISIBLE_FRACTION

    @property
    def shared_reason(self) -> str:
        """The one reason every unreadable check in this area gives, if they all give it.

        One cause usually takes out a whole area at once — no API key, or a listing that
        turns out to belong to another office. Each check records that cause for itself,
        which is right for the data and wrong for the page: the franchise mismatch printed
        its ninety words eleven times in one report. Said once, it is the most useful
        sentence in the report; said eleven times it is the reason nobody reads on.
        """
        reasons = {c.reason.strip() for c in self.checks if c.status == UNAVAILABLE and c.reason.strip()}
        unreadable = [c for c in self.checks if c.status == UNAVAILABLE]
        if len(reasons) == 1 and len(unreadable) > 1:
            return reasons.pop()
        return ""

    @property
    def unscorable_reason(self) -> str:
        if self.is_scorable:
            return ""
        if self.scorable_max <= 0:
            return self.shared_reason or "Nothing in this area could be checked."
        return "Only %s of %s could be checked — too little to score the area fairly." % (
            _points(self.scorable_max),
            _points(self.weight),
        )

    @property
    def score_note(self) -> str:
        """Why this area's score is not the whole story, in one line, or "".

        Lives here rather than in the printer because the terminal report and the markdown
        both need it, and two copies of this sentence would drift apart the first time
        either was reworded.
        """
        if self.unscorable_reason:
            return self.unscorable_reason
        if self.unavailable:
            return "%s couldn't be checked — those points left the total." % plural(
                len(self.unavailable), "check"
            )
        return ""

    @property
    def percent(self) -> Optional[float]:
        if not self.is_scorable:
            return None
        return round(100.0 * self.points / self.scorable_max, 1)

    @property
    def weighted(self) -> float:
        """Points out of the module's weight, on the checks we could actually see."""
        if not self.is_scorable:
            return 0.0
        return round(self.weight * self.points / self.scorable_max, 2)

    @property
    def unavailable(self) -> List[Check]:
        return [c for c in self.checks if c.status == UNAVAILABLE]

    @property
    def indicator(self) -> str:
        percent = self.percent
        if percent is None:
            return "grey"
        if percent >= 80:
            return "green"
        if percent >= 60:
            return "yellow"
        if percent >= 40:
            return "orange"
        return "red"


BANDS = ((80, "Strong", "green"), (60, "Good", "yellow"), (40, "Needs work", "orange"), (0, "Critical", "red"))


def band_for(score: float) -> Tuple[str, str]:
    for floor, label, colour in BANDS:
        if score >= floor:
            return label, colour
    return "Critical", "red"


@dataclass
class Location:
    city: str = ""
    state: str = ""
    zip_code: str = ""

    @property
    def state_name(self) -> str:
        return STATE_NAMES.get(self.state.upper(), "")

    def __str__(self) -> str:
        parts = [p for p in (self.city, self.state, self.zip_code) if p]
        return " ".join(parts) if parts else "(no location given)"


def parse_location(raw: str) -> Location:
    """Accepts "City, ST ZIP", "City ST ZIP", "City, State", or just a zip."""
    text = squash(raw or "").replace(",", " ")
    zip_match = ZIP_RE.search(text)
    zip_code = zip_match.group(1) if zip_match else ""
    if zip_match:
        text = text.replace(zip_match.group(0), " ")  # the whole match, +4 and all
    tokens = [t for t in squash(text).split(" ") if t]

    state = ""
    if tokens:
        tail = tokens[-1]
        if len(tail) == 2 and tail.isalpha():
            state = tail.upper()
            tokens = tokens[:-1]
        else:
            for code, name in STATE_NAMES.items():
                if name.lower() == " ".join(tokens[-2:]).lower():
                    state, tokens = code, tokens[:-2]
                    break
                if name.lower() == tail.lower():
                    state, tokens = code, tokens[:-1]
                    break
    city = " ".join(tokens).strip(" ,-")
    if city and city == city.lower():
        # A city typed in lowercase is printed in the report header and read back to the
        # operator, and "uniontown PA 15401" looks like our mistake rather than their typing.
        # Only an all-lowercase city is touched: title-casing a correct "McKeesport" would
        # break it into "Mckeesport".
        city = city.title()
    return Location(city=city, state=state, zip_code=zip_code)


# --------------------------------------------------------------------------------------
# Data collection: the website
# --------------------------------------------------------------------------------------


@dataclass
class Site:
    agency: str
    location: Location
    home: Page
    pages: List[Page] = field(default_factory=list)

    @property
    def all_pages(self) -> List[Page]:
        return [self.home] + self.pages

    def text(self) -> str:
        return " ".join(p.text for p in self.all_pages).lower()

    def headings(self) -> List[str]:
        return [text for page in self.all_pages for _, text in page.headings]

    def titles(self) -> str:
        return " ".join((p.title + " " + p.h1) for p in self.all_pages).lower()

    def page_for(self, role: str) -> Optional[Page]:
        for page in self.pages:
            if page.role == role:
                return page
        return None

    def jsonld_types(self) -> List[str]:
        found: List[str] = []
        for page in self.all_pages:
            for blob in page.jsonld:
                found.extend(_types_in(blob))
        return found

    def jsonld_objects(self) -> List[dict]:
        objects: List[dict] = []
        for page in self.all_pages:
            for blob in page.jsonld:
                objects.extend(_objects_in(blob))
        return objects

    def phones(self) -> List[str]:
        numbers: List[str] = []
        for page in self.all_pages:
            numbers.extend(normalize_phone(t) for t in page.tel_links)
            numbers.extend(normalize_phone(m) for m in PHONE_RE.findall(page.text)[:12])
        return [n for n in numbers if len(n) == 10]


def _objects_in(blob: Any) -> List[dict]:
    out: List[dict] = []
    if isinstance(blob, dict):
        out.append(blob)
        for value in blob.values():
            if isinstance(value, (dict, list)):
                out.extend(_objects_in(value))
    elif isinstance(blob, list):
        for item in blob:
            out.extend(_objects_in(item))
    return out


def _types_in(blob: Any) -> List[str]:
    types: List[str] = []
    for obj in _objects_in(blob):
        value = obj.get("@type")
        if isinstance(value, str):
            types.append(value.lower())
        elif isinstance(value, list):
            types.extend(str(v).lower() for v in value)
    return types


def crawl(url: str, agency: str, location: Location, fetcher: Fetcher, quiet: bool) -> Optional[Site]:
    log("Reading the website", quiet)
    home = fetcher.page(url)
    if home is None:
        return None

    origin = urlparse(home.url)
    base_host = origin.netloc.lower()
    seen = {home.url.rstrip("/")}
    chosen: List[Tuple[str, str]] = []

    for href, anchor in home.links:
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(home.url, href)
        parsed = urlparse(absolute)
        if parsed.netloc.lower() != base_host or parsed.scheme not in ("http", "https"):
            continue
        clean = absolute.split("#")[0].rstrip("/")
        if clean in seen:
            continue
        haystack = (parsed.path + " " + anchor).lower()
        for role, words in PAGE_TARGETS.items():
            if any(word in haystack for word in words):
                if any(role == r for r, _ in chosen):
                    break
                chosen.append((role, clean))
                seen.add(clean)
                break
        if len(chosen) >= MAX_PAGES:
            break

    pages: List[Page] = []
    for role, link in chosen:
        page = fetcher.page(link)
        if page is not None:
            page.role = role
            pages.append(page)

    return Site(agency=agency, location=location, home=home, pages=pages)


# --------------------------------------------------------------------------------------
# Data collection: Google, directories, reviews
# --------------------------------------------------------------------------------------


@dataclass
class Listing:
    """What Google publishes about the agency, when we have a key to ask with."""

    found: bool = False
    reason: str = ""
    name: str = ""
    address: str = ""
    phone: str = ""
    website: str = ""
    rating: Optional[float] = None
    review_count: Optional[int] = None
    photo_count: Optional[int] = None
    has_hours: Optional[bool] = None
    primary_type: str = ""
    types: List[str] = field(default_factory=list)
    business_status: str = ""
    reviews: List[dict] = field(default_factory=list)
    place_id: str = ""


PLACES_FIELDS = ",".join(
    "places." + f
    for f in (
        "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
        "rating", "userRatingCount", "regularOpeningHours", "photos", "types",
        "primaryTypeDisplayName", "businessStatus", "reviews",
    )
)


def fetch_listing(agency: str, location: Location, website: str, quiet: bool) -> Listing:
    key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not key:
        return Listing(reason="No Google Places API key is configured, so we could not read your Google listing.")

    query = squash("%s %s %s %s" % (agency, location.city, location.state, location.zip_code))
    cached = cache_read("places", query)
    payload = cached
    if payload is None:
        log("Checking the Google listing", quiet)
        payload = http_post_json(
            "https://places.googleapis.com/v1/places:searchText",
            {"textQuery": query, "maxResultCount": 5, "languageCode": "en"},
            {"X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACES_FIELDS},
        )
        if payload is None:
            return Listing(reason="Google's Places service did not answer, so your listing could not be read this run.")
        cache_write("places", query, payload)

    places = payload.get("places") or []
    if not places:
        return Listing(found=False, reason="")

    host = urlparse(website).netloc.lower().replace("www.", "")
    best = places[0]
    for place in places:
        place_host = urlparse(place.get("websiteUri", "")).netloc.lower().replace("www.", "")
        if host and place_host and (host in place_host or place_host in host):
            best = place
            break

    hours = best.get("regularOpeningHours") or {}
    return Listing(
        found=True,
        name=(best.get("displayName") or {}).get("text", ""),
        address=best.get("formattedAddress", ""),
        phone=best.get("nationalPhoneNumber", ""),
        website=best.get("websiteUri", ""),
        rating=best.get("rating"),
        review_count=best.get("userRatingCount"),
        photo_count=len(best.get("photos") or []),
        has_hours=bool(hours.get("periods") or hours.get("weekdayDescriptions")),
        primary_type=best.get("primaryTypeDisplayName", {}).get("text", "") if isinstance(best.get("primaryTypeDisplayName"), dict) else str(best.get("primaryTypeDisplayName") or ""),
        types=best.get("types") or [],
        business_status=best.get("businessStatus", ""),
        reviews=best.get("reviews") or [],
        place_id=best.get("id", ""),
    )


def serper_search(query: str) -> Optional[dict]:
    key = os.environ.get("SERPER_API_KEY", "").strip()
    if not key:
        return None
    cached = cache_read("serper", query)
    if cached is not None:
        return cached
    payload = http_post_json("https://google.serper.dev/search", {"q": query, "gl": "us", "num": 10}, {"X-API-KEY": key})
    if payload is not None:
        cache_write("serper", query, payload)
    return payload


# Words that appear in half the home care agency names in the country. They cannot
# identify anybody, so they cannot confirm that a directory page belongs to this agency.
GENERIC_NAME_WORDS = {
    "home", "homes", "homecare", "care", "cares", "caring", "agency", "agencies", "llc",
    "inc", "incorporated", "co", "company", "corp", "services", "service", "senior",
    "seniors", "elder", "elderly", "living", "health", "healthcare", "nursing", "nurse",
    "assistance", "assisted", "aide", "aides", "helpers", "helper", "help", "the", "and",
    "for", "of", "at", "in", "your", "our", "us", "america", "american", "usa",
}

# Pages on a directory that are not a business's listing. The first row is an index — a
# search box, a category, a city roll-up. The second is editorial and social: Angi offered
# "/articles/first-home-essential-checklist.htm" as a home care agency's listing, because
# "first" is in the slug, and Facebook offered a franchise's hiring post instead of a page.
NON_LISTING_MARKERS = (
    "/search", "/find", "/browse", "/directory", "/category", "/categories", "/c/",
    "find_desc=", "find_loc=", "?q=&", "/listings", "/results", "/near-me", "/all-",
    "/articles/", "/article/", "/blog/", "/news/", "/posts/", "/photos/", "/videos/",
    "/events/", "/jobs/", "/guides/", "/resources/", "/advice/",
)


def identifying_tokens(agency: str) -> List[str]:
    """The words in an agency's name that could only be this agency.

    "Lindsay's Loving Home Care Agency, LLC" identifies itself with "lindsays" and
    "loving"; the rest of it describes an industry. Phase 4 of the senior living tool
    learned this the hard way, matching "Exceptional Senior Living" to "Brookdale Senior
    Living" on shared words alone.
    """
    tokens: List[str] = []
    for raw in re.split(r"[^A-Za-z0-9]+", agency.lower()):
        if len(raw) < 4 or raw in GENERIC_NAME_WORDS:
            continue
        tokens.append(raw)
        if raw.endswith("s") and len(raw) > 4:
            tokens.append(raw[:-1])  # "lindsays" also matches a "lindsay" slug
    return tokens


def _is_not_a_listing(url: str) -> bool:
    lowered = url.lower()
    return any(marker in lowered for marker in NON_LISTING_MARKERS)


def _state_of(address: str) -> str:
    """The two-letter code for the state an address names, or "".

    The code beside the zip is read first because it is unambiguous. Falling back to state
    names is only safe afterwards: "123 Washington St, Burlington, WA" names two states by
    that test and only one of them is the state.
    """
    match = re.search(r",\s*([A-Za-z]{2})\.?\s+\d{5}", address)
    if match and match.group(1).upper() in STATE_NAMES:
        return match.group(1).upper()
    lowered = " %s " % address.lower()
    for code, name in STATE_NAMES.items():
        if " %s " % name.lower() in lowered or (" %s," % name.lower()) in lowered:
            return code
    return ""


def listing_market_mismatch(listing: "Listing", location: Location) -> str:
    """Why the listing we found cannot be scored as this agency's, or "".

    Auditing a franchise's national homepage against a town finds whichever office Google
    ranks first, and that was "FirstLight Home Care of Spokane and Coeur d'Alene", 300 miles
    from the Burlington the operator asked about. Its hours, its photos and its 5.0 stars
    from 67 families are real — they are just somebody else's, and banking 27 points of them
    tells this operator their listing is in good shape when they may not have one at all.

    A different *state* is the test, not a different town. A home care office genuinely does
    serve the next town over, and often the next county, so a nearby city keeps the softer
    note on the found check and stays scored. Crossing a state line is a different market,
    a different licence and a different set of families.
    """
    if not listing.found or not listing.address or not location.state:
        return ""
    theirs = _state_of(listing.address)
    if not theirs or theirs == location.state.upper():
        return ""
    return (
        "We found a Google listing for \"%s\" at %s — that is in %s, and you asked about %s. "
        "It is a different office, so scoring its listing and its reviews as yours would credit "
        "you for another franchise's work. Run the audit again with your own office's page and "
        "its own town, and if that office has no listing of its own, creating one is the single "
        "most valuable thing on this report." % (
            listing.name,
            listing.address,
            # Spelled out. "that is in ID, and you asked about WA" is two abbreviations in a
            # sentence whose whole job is to land a geographic surprise on the reader.
            STATE_NAMES.get(theirs, theirs),
            STATE_NAMES.get(location.state.upper(), location.state.upper()),
        )
    )


def _names_other_state(url: str, location: Location) -> bool:
    """Whether a directory URL puts this business in a state that is not the one we asked about.

    National franchises share one brand across hundreds of offices, so the name matches every
    one of them and the town is the only thing telling them apart. Searching for FirstLight in
    Burlington, Washington turned up "caring.com/senior-care/illinois/naperville/firstlight-
    home-care-of-naperville" — the right brand, the right kind of page, the wrong end of the
    country. City-partitioned directories put the state in the path, so when they name one that
    is not ours they are naming somebody else's office.
    """
    if not location.state:
        return False
    ours = location.state.upper()
    path = urlparse(url).path.lower()
    segments = set(re.split(r"[^a-z]+", path))
    for code, name in STATE_NAMES.items():
        if code == ours:
            continue
        low = name.lower()
        # Multi-word states are hyphenated in a path; single-word ones must be a whole
        # segment, or "indiana" would match "indianapolis" and "virginia" would match
        # every West Virginia listing while we were looking at Virginia.
        if " " in low:
            if low.replace(" ", "-") in path:
                return True
        elif low in segments:
            return True
    return False


def _is_opaque(url: str) -> bool:
    """Whether a URL identifies its business by an id rather than by name.

    This is the only case where "we found a page that might be yours" is worth saying. A
    slug that spells out a name has already answered the question: asking an operator to go
    and check whether yelp.com/biz/camelot-veterinary-services-uniontown is their home care
    agency wastes their time and makes the tool look like it cannot read.
    """
    segments = [segment for segment in urlparse(url).path.split("/") if segment]
    if not segments:
        return False
    last = segments[-1]
    return bool(re.fullmatch(r"[A-Za-z]{0,3}[\d][\w\-]*", last)) and any(ch.isdigit() for ch in last)


def find_citations(agency: str, location: Location, quiet: bool) -> Tuple[Dict[str, dict], bool]:
    """Locate the agency on each directory with a site: search.

    Being on the right domain is not being listed. A Yelp search page for the next town
    over and a YellowPages category index both sit on the right domain and mention the
    agency nowhere, and awarding points for them tells an operator not to bother claiming a
    listing they do not have. So a result counts only if the URL carries a word that
    identifies this agency; a page we cannot tie to them is reported as unconfirmed rather
    than passed or failed.
    """
    if not os.environ.get("SERPER_API_KEY", "").strip():
        return {}, False
    log("Looking for directory listings", quiet)
    results: Dict[str, dict] = {}
    where = squash("%s %s" % (location.city, location.state))
    tokens = identifying_tokens(agency)

    for label, domain, weight in DIRECTORIES:
        if weight <= 0:
            continue
        payload = serper_search('site:%s "%s"' % (domain, agency) if not where else 'site:%s %s %s' % (domain, agency, where))
        if payload is None:
            results[label] = {"url": None, "confirmed": False, "searched": False}
            continue

        host = domain.split("/")[0]
        confirmed: Optional[str] = None
        unconfirmed: Optional[str] = None
        for item in (payload.get("organic") or []):
            candidate = item.get("link", "")
            if host not in candidate.lower() or _is_not_a_listing(candidate):
                continue
            if _names_other_state(candidate, location):
                continue
            haystack = candidate.lower()
            # The result's own title counts too: some directories use a numeric slug.
            title = (item.get("title") or "").lower()
            if tokens and any(token in haystack or token in title for token in tokens):
                confirmed = candidate
                break
            if unconfirmed is None and _is_opaque(candidate):
                unconfirmed = candidate

        results[label] = {
            "url": confirmed or unconfirmed,
            "confirmed": confirmed is not None,
            "searched": True,
        }
    return results, True


def fetch_yelp(agency: str, location: Location) -> Optional[dict]:
    key = os.environ.get("YELP_API_KEY", "").strip()
    if not key:
        return None
    where = squash(str(location)) or "United States"
    cache_key = "%s|%s" % (agency, where)
    cached = cache_read("yelp", cache_key)
    if cached is not None:
        return cached
    from urllib.parse import quote

    url = "https://api.yelp.com/v3/businesses/search?term=%s&location=%s&limit=5" % (quote(agency), quote(where))
    reply = http_get(url, headers={"Authorization": "Bearer %s" % key, "Accept": "application/json"})
    if not reply.ok:
        return None
    try:
        payload = json.loads(reply.text)
    except ValueError:
        return None
    businesses = payload.get("businesses") or []
    best = businesses[0] if businesses else None
    cache_write("yelp", cache_key, best)
    return best


# --------------------------------------------------------------------------------------
# Module A — Google Business Profile (25)
# --------------------------------------------------------------------------------------


def module_google(site: Site, listing: Listing) -> Module:
    module = Module(
        "google",
        "Your Google listing",
        25.0,
        "What a family sees in Google Maps and in the local results — the single biggest source of home care enquiries.",
    )
    add = module.checks.append
    unavailable_reason = listing.reason

    if unavailable_reason:
        for check_id, label, points in (
            ("google.found", "You have a Google Business Profile we can find", 6.0),
            ("google.website", "Your listing points at your website", 4.0),
            ("google.phone", "Your listing's phone number matches your website", 3.0),
            ("google.area", "Your listing says which areas you cover", 3.0),
            ("google.category", "Your listing category says you provide home care", 3.0),
            ("google.hours", "Your listing shows when you can be reached", 3.0),
            ("google.photos", "Your listing has photos", 3.0),
        ):
            add(Check(check_id, label, UNAVAILABLE, points, reason=unavailable_reason))
        return module

    if not listing.found:
        add(Check(
            "google.found", "You have a Google Business Profile we can find", FAIL, 6.0,
            detail="We could not find a Google listing for \"%s\" near %s." % (site.agency, site.location),
            fix="Create and verify a Google Business Profile as a service-area business.",
            steps=[
                "Go to business.google.com and add your agency.",
                "Choose \"I deliver goods and services to my customers\" and hide the street address — you are a service-area business, not a storefront.",
                "List every city and county you actually staff, then complete verification (usually a postcard or video call).",
            ],
            effort=PROJECT,
        ))
        for check_id, label, points in (
            ("google.website", "Your listing points at your website", 4.0),
            ("google.phone", "Your listing's phone number matches your website", 3.0),
            ("google.area", "Your listing says which areas you cover", 3.0),
            ("google.category", "Your listing category says you provide home care", 3.0),
            ("google.hours", "Your listing shows when you can be reached", 3.0),
            ("google.photos", "Your listing has photos", 3.0),
        ):
            add(Check(check_id, label, UNAVAILABLE, points, reason="There is no listing to check these against yet."))
        return module

    where = (" (%s)" % listing.address) if listing.address else " with no public street address, which is normal for home care"
    found_detail = "Your listing is live as \"%s\"%s." % (listing.name, where)
    # A franchise office is often listed in the next town over. That may be perfectly fine —
    # or it may mean the town we were asked about has no listing of its own and we have just
    # scored a different office. Either way the operator needs to be told which one we read.
    city = site.location.city
    if city and listing.address and city.lower() not in listing.address.lower():
        found_detail += (
            " Note that the listing's address is not in %s. If you serve %s from that office, that is fine."
            " If there is a separate %s listing, this audit read the wrong one — run it again with that office's page." % (city, city, city)
        )
    add(Check("google.found", "You have a Google Business Profile we can find", PASS, 6.0, points=6.0, detail=found_detail))

    # Website match
    site_host = urlparse(site.home.url).netloc.lower().replace("www.", "")
    listing_host = urlparse(listing.website).netloc.lower().replace("www.", "")
    if listing_host and (site_host in listing_host or listing_host in site_host):
        add(Check("google.website", "Your listing points at your website", PASS, 4.0, points=4.0, detail="Your listing links to %s." % listing_host))
    elif listing_host:
        add(Check(
            "google.website", "Your listing points at your website", WARN, 4.0, points=2.0,
            detail="Your listing links to %s, which is not the site we audited (%s)." % (listing_host, site_host),
            fix="Point the listing at the page you want families to land on — usually this office's own page, not the national homepage.",
            steps=["Open your Business Profile, edit the website field, and paste the URL of this office's page."],
        ))
    else:
        add(Check(
            "google.website", "Your listing points at your website", FAIL, 4.0,
            detail="Your listing has no website link.",
            fix="Add your website to the listing.",
            steps=["Open your Business Profile and paste your website address into the website field."],
        ))

    # Phone match
    site_phones = set(site.phones())
    listing_phone = normalize_phone(listing.phone)
    if not listing_phone:
        add(Check(
            "google.phone", "Your listing's phone number matches your website", FAIL, 3.0,
            detail="Your listing has no phone number on it.",
            fix="Add the phone number a family should call.",
            steps=["Open your Business Profile and add your main phone number."],
        ))
    elif listing_phone in site_phones:
        add(Check("google.phone", "Your listing's phone number matches your website", PASS, 3.0, points=3.0, detail="Both show the same number."))
    elif site_phones:
        add(Check(
            "google.phone", "Your listing's phone number matches your website", FAIL, 3.0,
            detail="Your listing shows a different number from your website.",
            fix="Use one number everywhere, or the two records look like two businesses.",
            steps=[
                "Decide which number families should reach you on.",
                "Update whichever of the two is wrong — the listing or the website.",
                "Check any call-tracking number you use is set as the primary and your real line as secondary, not the other way round.",
            ],
        ))
    else:
        add(Check("google.phone", "Your listing's phone number matches your website", UNAVAILABLE, 3.0, reason="We could not find a phone number on your website to compare against."))

    # Service area — the check that matters most for a home care agency, and the one
    # Google does not publish, so it is honestly unverifiable.
    add(Check(
        "google.area", "Your listing says which areas you cover", UNAVAILABLE, 3.0,
        reason="Google does not publish a listing's service-area list to outside tools, so we could not read yours. It is worth opening your profile and checking: for a home care agency this list decides which towns you appear in at all.",
    ))

    # Category.
    #
    # Google publishes only a coarse type for care businesses at this access level. Every
    # agency tested comes back as "health", alongside "service", "point_of_interest" and
    # "establishment" — none of which is a category anyone chose. Matching the word
    # "health" here awards three points for a field we cannot read, and reporting the
    # absence of a specific type as a failure docks three for the same. Both are wrong, so
    # an unreadable category reports unavailable with the advice still attached.
    generic = {"health", "service", "point_of_interest", "establishment", "store", "business"}
    specific = [t for t in listing.types if t.lower() not in generic]
    care_words = ("home_health", "home health", "home care", "homecare", "nursing", "caregiver", "elder", "senior")
    readable = (listing.primary_type.lower() not in generic and listing.primary_type) or specific
    if readable and any(word in (listing.primary_type + " " + " ".join(specific)).lower() for word in care_words):
        add(Check("google.category", "Your listing category says you provide home care", PASS, 3.0, points=3.0, detail="Google reports your listing under \"%s\"." % (listing.primary_type or ", ".join(specific[:2]))))
    elif readable:
        add(Check(
            "google.category", "Your listing category says you provide home care", WARN, 3.0, points=1.5,
            detail="Google reports your listing as \"%s\", which is not a home care category." % (listing.primary_type or ", ".join(specific[:2])),
            fix="Set the primary category to \"Home health care service\" or \"Home care service\".",
            steps=[
                "Open your Business Profile and edit the primary category.",
                "Choose \"Home health care service\" (medical) or \"Home care service\" (non-medical) — whichever you actually are.",
                "Add secondary categories for what else you do, e.g. \"Elder care\", \"Respite care service\".",
            ],
        ))
    else:
        add(Check(
            "google.category", "Your listing category says you provide home care", UNAVAILABLE, 3.0,
            reason="Google shares only a broad type for care businesses (\"%s\"), not the category you chose, so we could not read it. Worth checking yourself: the primary category should be \"Home care service\" or \"Home health care service\", and it decides which searches you appear in."
            % (listing.primary_type or ", ".join(listing.types[:2]) or "none given"),
        ))

    # Hours
    if listing.has_hours:
        add(Check("google.hours", "Your listing shows when you can be reached", PASS, 3.0, points=3.0, detail="Your hours are filled in."))
    else:
        add(Check(
            "google.hours", "Your listing shows when you can be reached", FAIL, 3.0,
            detail="Your listing has no hours on it.",
            fix="Add hours — and if you answer the phone around the clock, say so.",
            steps=[
                "Open your Business Profile and set your office hours.",
                "If someone always answers, set the hours to open 24 hours: families call in a crisis, and at 9pm a closed listing loses the call.",
            ],
        ))

    # Photos
    count = listing.photo_count or 0
    if count >= 10:
        add(Check("google.photos", "Your listing has photos", PASS, 3.0, points=3.0, detail="Google is showing %s on your listing." % plural(count, "photo")))
    elif count > 0:
        add(Check(
            "google.photos", "Your listing has photos", WARN, 3.0, points=1.5,
            detail="Only %s on your listing." % plural(count, "photo"),
            fix="Get to ten or more photos of real caregivers and real staff.",
            steps=[
                "Photograph your office team and (with written permission) caregivers with clients.",
                "Upload ten or more. Stock photography reads as stock photography and families discount it.",
                "Add a few every quarter — a listing that never changes looks dormant.",
            ],
        ))
    else:
        add(Check(
            "google.photos", "Your listing has photos", FAIL, 3.0,
            detail="Your listing has no photos.",
            fix="Add at least ten photos.",
            steps=["Photograph your team and office.", "Upload them to your Business Profile.", "Avoid stock images — families can tell."],
        ))

    return module


# --------------------------------------------------------------------------------------
# Module B — directory listings (20)
# --------------------------------------------------------------------------------------


def module_citations(site: Site, citations: Dict[str, dict], searched: bool, yelp: Optional[dict]) -> Module:
    module = Module(
        "citations",
        "Your listings on other sites",
        20.0,
        "Every directory a family or an AI assistant might read about you, and whether your details are on it.",
    )
    add = module.checks.append

    if not searched:
        reason = "No Serper API key is configured, so we could not search the directories for you."
        for label, domain, weight in DIRECTORIES:
            if weight <= 0:
                continue
            add(Check("citation.%s" % domain, "You are listed on %s" % label, UNAVAILABLE, weight, reason=reason))
        return module

    for label, domain, weight in DIRECTORIES:
        if weight <= 0:
            continue
        found = citations.get(label) or {}
        link = found.get("url")
        check_id = "citation.%s" % domain
        if label not in citations or not found.get("searched"):
            add(Check(check_id, "You are listed on %s" % label, UNAVAILABLE, weight, reason="The search for this directory did not complete."))
        elif link and found.get("confirmed"):
            # The whole URL, not a shortened one: the part that identifies the listing is
            # at the end of it, so a cut leaves every directory row looking alike.
            add(Check(check_id, "You are listed on %s" % label, PASS, weight, points=weight, detail=link))
        elif link:
            # On the right site, but nothing ties the page to this agency. Neither a pass nor
            # a fail is honest: the points leave the total and the operator gets the link.
            add(Check(
                check_id, "You are listed on %s" % label, UNAVAILABLE, weight,
                reason="We found a page on %s that may be yours but could not confirm it names your agency: %s. Worth opening to check whether the listing is yours, someone else's, or a category page." % (label, link),
            ))
        else:
            tier = "families and search engines both lean on it" if weight >= 2.5 else "it helps confirm your details rather than bring enquiries directly"
            add(Check(
                check_id, "You are listed on %s" % label, FAIL, weight,
                detail="We could not find you on %s." % label,
                fix="Claim or create your %s listing — %s." % (label, tier),
                steps=[
                    "Search %s for your agency first; an unclaimed listing may already exist." % label,
                    "Claim it if it does, create it if it does not.",
                    "Use exactly the same agency name, phone number and service area as your Google listing.",
                ],
                effort=QUICK if weight >= 2.5 else ONGOING,
            ))

    # Yelp's own API naming the business is confirmation the SERP could not give us, so it
    # settles both a failure and an unconfirmed page.
    if yelp:
        rating, count = yelp.get("rating"), yelp.get("review_count")
        if rating:
            for check in module.checks:
                if check.id == "citation.yelp.com" and check.status in (FAIL, UNAVAILABLE):
                    check.status, check.points = PASS, check.max_points
                    check.detail = yelp.get("url") or "Yelp shows %.1f stars from %s." % (rating, plural(int(count or 0), "review"))
                    check.fix, check.steps, check.reason = "", [], ""
    return module


# --------------------------------------------------------------------------------------
# Module C — the website (25)
# --------------------------------------------------------------------------------------


def module_website(site: Site) -> Module:
    module = Module(
        "website",
        "Your website's local signals",
        25.0,
        "Whether your own site tells a search engine where you work, what you do and how to reach you.",
    )
    add = module.checks.append
    text = site.text()
    titles = site.titles()
    city = site.location.city.lower()

    # 1. Phone reachable in one tap (3)
    tel_on_home = bool(site.home.tel_links)
    phone_in_text = bool(PHONE_RE.search(site.home.text[:2500]))
    if tel_on_home:
        add(Check("web.phone", "Your phone number is one tap away", PASS, 3.0, points=3.0, detail="Your homepage has a tap-to-call link."))
    elif phone_in_text:
        add(Check(
            "web.phone", "Your phone number is one tap away", WARN, 3.0, points=1.5,
            detail="Your number is on the page as text, but it is not a tap-to-call link.",
            fix="Make the number a link so a phone dials it when tapped.",
            steps=[
                "Ask whoever maintains the site to wrap the number in a tel: link.",
                "Keep it visible in the header on a phone, not only in the footer.",
            ],
        ))
    else:
        add(Check(
            "web.phone", "Your phone number is one tap away", FAIL, 3.0,
            detail="We could not find a phone number on your homepage.",
            fix="Put your phone number in the header of every page, as a tap-to-call link.",
            steps=["Add the number to the site header.", "Make it a tel: link so phones dial it.", "Repeat it on the contact page."],
        ))

    # 2. Service area named (3) — the home care check
    areas_page = site.page_for("areas")
    zips_found = len(set(ZIP_RE.findall(" ".join(p.text for p in site.all_pages))))
    area_words = ("areas we serve", "service area", "areas served", "cities we serve", "communities we serve", "counties we serve", "where we serve", "locations we serve")
    names_areas = any(word in text for word in area_words)
    if areas_page or (names_areas and zips_found >= 3):
        where = areas_page.url if areas_page else "your site"
        add(Check("web.service_area", "Your site lists the towns you cover", PASS, 3.0, points=3.0, detail="Service areas are named on %s." % _path_of(where)))
    elif names_areas:
        add(Check(
            "web.service_area", "Your site lists the towns you cover", WARN, 3.0, points=1.5,
            detail="Your site mentions a service area but does not spell out the towns.",
            fix="List every city, county and zip code you staff, by name.",
            steps=[
                "Make one \"Areas we serve\" page.",
                "List every town and zip code you actually cover — families search \"home care in <their town>\", not \"home care near me\".",
                "Link that page from your main menu.",
            ],
            effort=QUICK,
        ))
    else:
        add(Check(
            "web.service_area", "Your site lists the towns you cover", FAIL, 3.0,
            detail="We could not find anywhere on your site that names the towns you serve.",
            fix="Add an \"Areas we serve\" page naming every town and zip code.",
            steps=[
                "Write down every city, county and zip code your caregivers actually travel to.",
                "Put them on one page called \"Areas we serve\" and link it from the main menu.",
                "You are a service-area business: this list is the single strongest local signal you own.",
            ],
            effort=QUICK,
        ))

    # 3. City in the title / heading (3)
    if city and city in titles:
        add(Check("web.city_in_title", "Your page title says where you work", PASS, 3.0, points=3.0, detail="\"%s\" appears in your title or main heading." % site.location.city))
    elif city and city in text:
        add(Check(
            "web.city_in_title", "Your page title says where you work", WARN, 3.0, points=1.5,
            detail="Your town is on the page but not in the title or main heading.",
            # "H1" is the one piece of jargon that had reached a fix title. The step below it
            # already says "main heading" in plain words; the title said it in markup terms.
            fix="Put the town in the page title and the main heading.",
            steps=[
                "Change your homepage title to something like \"Home Care in %s, %s | %s\"." % (site.location.city or "your town", site.location.state or "ST", site.agency),
                "Make the main heading say the same thing in plain words.",
            ],
        ))
    elif city:
        add(Check(
            "web.city_in_title", "Your page title says where you work", FAIL, 3.0,
            detail="\"%s\" does not appear on the pages we read." % site.location.city,
            fix="Name your town on the homepage, in the title and in the heading.",
            steps=["Add the town to your homepage title.", "Add it to the main heading.", "Mention it in the first paragraph."],
        ))
    else:
        add(Check("web.city_in_title", "Your page title says where you work", UNAVAILABLE, 3.0, reason="No town was given on the command line, so there was nothing to look for."))

    # 4. A page per service (4)
    found_services = [name for name, words in SERVICE_TERMS.items() if any(w in text for w in words)]
    service_pages = [p for p in site.all_pages if any(w in (p.title + " " + p.h1).lower() for words in SERVICE_TERMS.values() for w in words)]
    if len(found_services) >= 4 and len(service_pages) >= 2:
        add(Check("web.services", "Each kind of care you offer has its own page", PASS, 4.0, points=4.0, detail="We found %s named: %s." % (plural(len(found_services), "service"), ", ".join(found_services[:5]))))
    elif found_services:
        add(Check(
            "web.services", "Each kind of care you offer has its own page", WARN, 4.0, points=2.0,
            detail="You name %s but they mostly share one page." % plural(len(found_services), "service"),
            fix="Give each service its own page with its own heading.",
            steps=[
                "Make one page each for the services you really sell — personal care, companion care, dementia care, respite, 24-hour care.",
                "On each, say who it is for, what a caregiver actually does, and what it costs per hour.",
                "One page per service is one more search you can win; a single \"Services\" page wins one.",
            ],
            effort=PROJECT,
        ))
    else:
        add(Check(
            "web.services", "Each kind of care you offer has its own page", FAIL, 4.0,
            detail="We could not tell from your site which kinds of care you provide.",
            fix="Name your services in plain words, one page each.",
            steps=[
                "List the services you sell.",
                "Use the words families use: personal care, companion care, dementia care, respite care, 24-hour care.",
                "Give each its own page.",
            ],
            effort=PROJECT,
        ))

    # 5. Structured data (3)
    types = [t.lower() for t in site.jsonld_types()]
    local = [t for t in types if t in LOCALBUSINESS_TYPES]
    has_area = any(("areaserved" in json.dumps(o).lower()) for o in site.jsonld_objects())
    if local and has_area:
        add(Check("web.schema", "Your site describes itself to search engines", PASS, 3.0, points=3.0, detail="Found %s markup with a service area." % ", ".join(sorted(set(local))[:2])))
    elif local:
        add(Check(
            "web.schema", "Your site describes itself to search engines", WARN, 3.0, points=1.5,
            detail="You have %s markup, but it does not say which areas you serve." % ", ".join(sorted(set(local))[:2]),
            fix="Add areaServed to your existing markup.",
            steps=[
                "Ask your web person to add an areaServed list to the business markup already on the site.",
                "List each city or county — this is how a service-area business tells a machine where it works.",
            ],
            effort=PROJECT,
        ))
    else:
        add(Check(
            "web.schema", "Your site describes itself to search engines", FAIL, 3.0,
            detail="We found no business markup on your site." if not types else "Your site has markup, but none of it describes the business itself.",
            fix="Add HomeHealthCareBusiness (or LocalBusiness) markup with your phone, hours and service area.",
            steps=[
                "Ask your web person for JSON-LD markup on the homepage.",
                "Use type HomeHealthCareBusiness, and include name, telephone, url, openingHours and areaServed.",
                "Test it in Google's Rich Results Test.",
            ],
            effort=PROJECT,
        ))

    # 6. A way to ask for care (2)
    contact = site.page_for("contact")
    forms = sum(p.forms for p in site.all_pages)
    if forms and (contact or "assessment" in text or "consultation" in text):
        add(Check("web.enquiry", "A family can ask for care without phoning", PASS, 2.0, points=2.0, detail="There is a contact form%s." % (" and a free assessment offer" if "assessment" in text else "")))
    elif forms:
        add(Check(
            "web.enquiry", "A family can ask for care without phoning", WARN, 2.0, points=1.0,
            detail="You have a form, but nothing offers a first conversation.",
            fix="Offer a free in-home assessment by name.",
            steps=["Add \"Request a free in-home assessment\" as the button on your form.", "Say what happens next and how soon someone will call back."],
        ))
    else:
        add(Check(
            "web.enquiry", "A family can ask for care without phoning", FAIL, 2.0,
            detail="We found no contact form on your site.",
            fix="Add a short enquiry form offering a free in-home assessment.",
            steps=["Add a form with name, phone, and \"what help do you need\".", "Keep it to four fields.", "Promise a callback time and keep it."],
        ))

    # 7. Works on a phone, over https (2)
    https = site.home.url.startswith("https://")
    if https and site.home.has_viewport:
        add(Check("web.mobile", "Your site works on a phone and is secure", PASS, 2.0, points=2.0, detail="Secure, and built to resize on a phone."))
    else:
        missing = []
        if not https:
            missing.append("it is not served over https")
        if not site.home.has_viewport:
            missing.append("it has no mobile viewport setting")
        add(Check(
            "web.mobile", "Your site works on a phone and is secure", FAIL if not https else WARN, 2.0,
            points=0.0 if not https else 1.0,
            detail="On your homepage, %s." % " and ".join(missing),
            fix="Serve the site over https and make sure it resizes on a phone.",
            steps=["Ask your host to enable a free SSL certificate and redirect http to https.", "Most families reach you on a phone; a warning banner in the address bar ends the visit."],
        ))

    # 8. Trust signals (2)
    trust = [word for word in TRUST_TERMS if word in text]
    if len(trust) >= 3:
        add(Check("web.trust", "Your site says your caregivers are vetted", PASS, 2.0, points=2.0, detail="Your site mentions %s." % ", ".join(trust[:4])))
    elif trust:
        add(Check(
            "web.trust", "Your site says your caregivers are vetted", WARN, 2.0, points=1.0,
            detail="You mention %s, but not much else about screening." % ", ".join(trust),
            fix="Say plainly that caregivers are licensed, bonded, insured and background-checked.",
            steps=[
                "Put one sentence near the top of the homepage: licensed, bonded, insured, background-checked.",
                "Add your state license number if your state issues one — it is a trust signal and a search term.",
            ],
        ))
    else:
        add(Check(
            "web.trust", "Your site says your caregivers are vetted", FAIL, 2.0,
            detail="We found nothing on your site about screening or licensing.",
            fix="Say how caregivers are screened, and name your license.",
            steps=[
                "State that caregivers are background-checked, bonded and insured.",
                "Add your state license number.",
                "This is the first question every family asks about letting a stranger into a parent's home.",
            ],
        ))

    # 9. Hiring page (2) — home care's growth is caregiver supply, and the page ranks
    careers = site.page_for("careers")
    hiring_words = ("caregiver job", "now hiring", "join our team", "apply now", "caregiver application", "become a caregiver")
    if careers:
        add(Check("web.hiring", "Caregivers can find and apply for a job", PASS, 2.0, points=2.0, detail="You have a careers page at %s." % _path_of(careers.url)))
    elif any(word in text for word in hiring_words):
        add(Check(
            "web.hiring", "Caregivers can find and apply for a job", WARN, 2.0, points=1.0,
            detail="You mention hiring, but there is no careers page we could find.",
            fix="Give hiring its own page with an application form.",
            steps=["Add a \"Caregiver jobs in %s\" page." % (site.location.city or "your area"), "Put pay range, shifts and an application form on it."],
        ))
    else:
        add(Check(
            "web.hiring", "Caregivers can find and apply for a job", FAIL, 2.0,
            detail="We found no careers or caregiver hiring page.",
            fix="Add a caregiver jobs page.",
            steps=[
                "Create \"Caregiver jobs in %s\"." % (site.location.city or "your area"),
                "Include pay range, shift types and a short application form.",
                "It recruits and it ranks: \"caregiver jobs near me\" is searched more than most of your service terms.",
            ],
        ))

    # 10. How families pay (1). What an hour actually costs is a separate check in the AI
    # readiness module — listing the ways to pay and naming a price are different promises,
    # and a site very often does the first while refusing the second.
    pays = [name for name, words in PAYMENT_TERMS.items() if any(w in text for w in words)]
    if pays and any(w in text for w in COST_TERMS):
        add(Check("web.cost", "Your site says how families can pay", PASS, 1.0, points=1.0, detail="You mention %s." % ", ".join(pays[:4])))
    else:
        add(Check(
            "web.cost", "Your site says how families can pay", FAIL if not pays else WARN, 1.0, points=0.0 if not pays else 0.5,
            detail="Your site says little about what care costs or how families pay for it.",
            fix="Add a page on cost and payment options.",
            steps=[
                "Give an hourly range, even a wide one. Families who cannot find a price assume the worst and call someone else.",
                "List what you accept: private pay, long-term care insurance, Medicaid waiver, VA benefits.",
                "Say plainly that Medicare does not pay for non-medical home care — it is the most common misunderstanding you can clear up.",
            ],
        ))

    return module


# --------------------------------------------------------------------------------------
# Module D — reviews (15)
# --------------------------------------------------------------------------------------


def module_reviews(site: Site, listing: Listing, yelp: Optional[dict]) -> Module:
    module = Module("reviews", "Your reviews", 15.0, "What families say about you where other families can read it.")
    add = module.checks.append
    text = site.text()

    if listing.reason or not listing.found:
        reason = listing.reason or "We could not find your Google listing, so there were no reviews to read."
        add(Check("reviews.rating", "Your star rating stands up", UNAVAILABLE, 4.0, reason=reason))
        add(Check("reviews.volume", "You have enough reviews to be believed", UNAVAILABLE, 3.0, reason=reason))
        add(Check("reviews.recency", "Reviews are still arriving", UNAVAILABLE, 3.0, reason=reason))
    else:
        rating = listing.rating or 0.0
        count = int(listing.review_count or 0)

        if rating >= 4.5:
            add(Check("reviews.rating", "Your star rating stands up", PASS, 4.0, points=4.0, detail="%.1f stars on Google." % rating))
        elif rating >= 4.0:
            add(Check(
                "reviews.rating", "Your star rating stands up", WARN, 4.0, points=2.5,
                detail="%.1f stars on Google." % rating,
                fix="Work the rating up above 4.5 — it is the number families compare first.",
                steps=[
                    "Ask every satisfied family, at the moment they say thank you.",
                    "Reply to every critical review calmly and publicly; it reads better than silence.",
                ],
                effort=ONGOING,
            ))
        else:
            add(Check(
                "reviews.rating", "Your star rating stands up", FAIL, 4.0, points=min(1.0, max(0.0, rating - 3.0)),
                detail="%.1f stars on Google. Below four stars, families stop calling." % rating,
                # No claim about where this sits in the list. It is grouped as ongoing work,
                # because a rating cannot be fixed this afternoon, so it prints around
                # nineteenth — and "ahead of anything else on this list" printed at number
                # nineteen is the report arguing with itself. The importance is real and
                # worth saying; the position is not ours to promise here.
                fix="Get your Google rating back above four stars — nothing else on this list turns away as many families.",
                steps=[
                    "Read the one- and two-star reviews for the pattern; there usually is one.",
                    "Fix the pattern, then reply to each review saying what changed.",
                    "Ask happy families for reviews steadily, not in one burst.",
                ],
                effort=ONGOING,
            ))

        if count >= 25:
            add(Check("reviews.volume", "You have enough reviews to be believed", PASS, 3.0, points=3.0, detail="%s on Google." % plural(count, "review")))
        elif count >= 10:
            add(Check(
                "reviews.volume", "You have enough reviews to be believed", WARN, 3.0, points=1.5,
                detail="%s on Google." % plural(count, "review"),
                fix="Get above 25 reviews.",
                steps=["Ask at the end of every good week of care.", "Send the direct review link by text — it triples the response rate."],
                effort=ONGOING,
            ))
        else:
            add(Check(
                "reviews.volume", "You have enough reviews to be believed", FAIL, 3.0, points=min(1.0, count * 0.15),
                detail="Only %s on Google. A handful reads as a new agency, whatever your rating." % plural(count, "review"),
                fix="Build up to at least 25 Google reviews.",
                steps=[
                    "Get your Google review link from your Business Profile.",
                    "Text it to the families you know are happy — a few each week.",
                    "Never buy reviews or offer anything for them; Google removes them and it is worse than having none.",
                ],
                effort=ONGOING,
            ))

        recent = _recent_review_days(listing.reviews)
        if recent is None:
            add(Check("reviews.recency", "Reviews are still arriving", UNAVAILABLE, 3.0, reason="Google did not share review dates for your listing."))
        elif recent <= 60:
            add(Check("reviews.recency", "Reviews are still arriving", PASS, 3.0, points=3.0, detail="Your most recent review is %s old." % plural(recent, "day")))
        elif recent <= 180:
            add(Check(
                "reviews.recency", "Reviews are still arriving", WARN, 3.0, points=1.5,
                detail="Your most recent review is %s old." % plural(recent, "day"),
                fix="Keep a steady trickle — freshness counts as much as the total.",
                steps=["Ask one family a week.", "Put the review link in your invoice email."],
                effort=ONGOING,
            ))
        else:
            add(Check(
                "reviews.recency", "Reviews are still arriving", FAIL, 3.0,
                detail="Your most recent review is %s old, which reads as an agency that stopped." % plural(recent, "day"),
                fix="Get reviews arriving again, and keep them arriving.",
                steps=["Ask your current families this month.", "Then keep asking, one a week, indefinitely — freshness counts as much as the total."],
                effort=ONGOING,
            ))

    # Yelp, from the reviews angle rather than the citation angle. Existing is not the same
    # as helping: a listing carrying one angry review scores worse than no listing for the
    # family who finds it, so presence alone does not earn the points.
    if yelp and yelp.get("rating"):
        second_rating = float(yelp["rating"] or 0)
        second_count = int(yelp.get("review_count") or 0)
        detail = "Yelp shows %.1f stars from %s." % (second_rating, plural(second_count, "review"))
        if second_rating >= 4.0 and second_count >= 5:
            add(Check("reviews.second_site", "You have reviews somewhere besides Google", PASS, 2.0, points=2.0, detail=detail))
        elif second_count < 5:
            add(Check(
                "reviews.second_site", "You have reviews somewhere besides Google", WARN, 2.0, points=0.75,
                detail=detail + " With that few, a single unhappy family is your entire rating.",
                fix="Fill out your Yelp listing and reply to the review sitting on it.",
                steps=[
                    "Reply publicly and calmly to the review that is there. Families read the reply as much as the review.",
                    "Fill the listing out — services, hours, service area, photos — so there is something beside the star count.",
                    "Do not ask families for Yelp reviews: Yelp filters solicited ones and can penalise the listing. Mention that you are on Yelp and leave it there.",
                ],
                effort=QUICK,
            ))
        else:
            add(Check(
                "reviews.second_site", "You have reviews somewhere besides Google", WARN, 2.0, points=1.0,
                detail=detail,
                fix="Reply to the low reviews on your other review site.",
                steps=[
                    "Read the low reviews for the pattern.",
                    "Reply to each one publicly, saying what you changed.",
                ],
                effort=ONGOING,
            ))
    elif os.environ.get("YELP_API_KEY", "").strip():
        add(Check(
            "reviews.second_site", "You have reviews somewhere besides Google", FAIL, 2.0,
            detail="We found no Yelp reviews for you.",
            fix="Claim your Yelp listing so reviews have somewhere else to land.",
            steps=[
                "Claim the listing at biz.yelp.com.",
                "Fill in services, hours and service area.",
                "Do not solicit Yelp reviews — Yelp filters solicited ones out. Claim it, keep it accurate, and let it sit.",
            ],
            effort=QUICK,
        ))
    else:
        add(Check("reviews.second_site", "You have reviews somewhere besides Google", UNAVAILABLE, 2.0, reason="No Yelp API key is configured, so we could not check for a second review source."))

    # Testimonials on the site — always checkable, so the module is never wholly unscored.
    quotes = site.page_for("reviews")
    testimonial_words = ("testimonial", "what families say", "what our clients say", "reviews from", "client stories")
    if quotes or any(word in text for word in testimonial_words):
        add(Check("reviews.on_site", "Your own site shows what families say", PASS, 3.0, points=3.0, detail="Testimonials appear on your site."))
    else:
        add(Check(
            "reviews.on_site", "Your own site shows what families say", FAIL, 3.0,
            detail="We found no testimonials on your website.",
            fix="Put real quotes from families on the site, with first name and town.",
            steps=[
                "Ask three families for permission to quote them.",
                "Put the quotes on the homepage and a testimonials page.",
                "Include the town — \"Susan, Virginia Beach\" is a local signal as well as a reference.",
            ],
        ))

    return module


def _recent_review_days(reviews: Sequence[dict]) -> Optional[int]:
    newest: Optional[float] = None
    for review in reviews or []:
        stamp = review.get("publishTime") or ""
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})", stamp)
        if not match:
            continue
        try:
            import calendar, datetime

            when = datetime.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            days = (datetime.date.today() - when).days
        except Exception:
            continue
        newest = days if newest is None else min(newest, days)
    return int(newest) if newest is not None else None


# --------------------------------------------------------------------------------------
# Module E — AI search readiness (15)
#
# No AI API is called. What an assistant can say about an agency is decided by whether the
# agency's own pages contain liftable, unambiguous answers, and that is readable from the
# HTML. Calling a model would measure the model's mood, not the website.
# --------------------------------------------------------------------------------------


def module_geo(site: Site) -> Module:
    module = Module(
        "geo",
        "Whether AI can quote your site",
        15.0,
        "ChatGPT, Gemini and Google's own answers read your pages before they reply. This is whether there is anything on them to lift.",
    )
    add = module.checks.append
    text = site.text()
    # Headings are matched in lower case but quoted back as written. A heading printed as
    # "not sure what care you need?" reads as a transcription error, not as their heading.
    heads = site.headings()
    city = site.location.city.lower()

    # 1. One plain sentence saying what you are and where (3)
    opening = site.home.text[:900].lower()
    pattern = re.compile(r"\b(is|are|provides?|offers?|serving|serves)\b.{0,80}\b(home care|in-home care|senior care|caregiv|companion care|personal care)", re.I)
    if pattern.search(opening) and (not city or city in opening):
        add(Check("geo.sentence", "One plain sentence says what you are and where", PASS, 3.0, points=3.0, detail="Your homepage opens by saying it plainly."))
    elif pattern.search(text[:4000]):
        add(Check(
            "geo.sentence", "One plain sentence says what you are and where", WARN, 3.0, points=1.5,
            detail="You say it, but not at the top of the homepage where it gets lifted from.",
            fix="Move the plain sentence to the top of the homepage.",
            steps=[
                "Write: \"%s is a home care agency serving %s and the surrounding area.\"" % (site.agency, site.location.city or "your area"),
                "Put it in the first paragraph, as ordinary text.",
                "It will read as almost too obvious. That is the point — it is the sentence an assistant repeats.",
            ],
        ))
    else:
        add(Check(
            "geo.sentence", "One plain sentence says what you are and where", FAIL, 3.0,
            detail="Nothing on your homepage states plainly what you do and where you do it.",
            fix="Add that one sentence near the top of the homepage.",
            steps=[
                "Write: \"%s is a home care agency serving %s and the surrounding area.\"" % (site.agency, site.location.city or "your area"),
                "Put it in the first paragraph as text, not inside an image or a slider.",
            ],
        ))

    # 2. Questions answered in the words families use (3)
    questions = [h for h in heads if h.endswith("?") or h.lower().startswith(QUESTION_WORDS)]
    if len(questions) >= 5:
        add(Check("geo.questions", "Your headings answer the questions families ask", PASS, 3.0, points=3.0, detail="%s read as questions, e.g. \"%s\"." % (plural(len(questions), "heading"), truncate(questions[0], 60))))
    elif questions:
        add(Check(
            "geo.questions", "Your headings answer the questions families ask", WARN, 3.0, points=1.5,
            detail="Only %s on your site is written as a question." % plural(len(questions), "heading"),
            fix="Turn the questions you answer on the phone every day into headings.",
            steps=[
                "Write down the ten questions you actually get asked.",
                "Make each one a heading, with a two-sentence answer under it.",
                "\"How much does home care cost in %s?\" is a heading. \"Our Services\" is not." % (site.location.city or "your town"),
            ],
            effort=PROJECT,
        ))
    else:
        add(Check(
            "geo.questions", "Your headings answer the questions families ask", FAIL, 3.0,
            detail="None of your headings is written as a question.",
            fix="Add a FAQ, using the exact questions families ask you.",
            steps=[
                "List the ten questions you answer on every enquiry call.",
                "Give each a heading and a short, direct answer.",
                "An assistant lifts a question-and-answer pair far more readily than a paragraph of marketing copy.",
            ],
            effort=PROJECT,
        ))

    # 3. FAQ markup (2)
    types = [t.lower() for t in site.jsonld_types()]
    if any(t in ("faqpage", "question", "qapage") for t in types):
        add(Check("geo.faq_schema", "Your questions are marked up for machines", PASS, 2.0, points=2.0, detail="FAQ markup found."))
    else:
        add(Check(
            "geo.faq_schema", "Your questions are marked up for machines", FAIL, 2.0,
            detail="We found no FAQ markup on your site.",
            fix="Add FAQPage markup around your questions and answers.",
            steps=["Ask your web person to add FAQPage JSON-LD to the FAQ page.", "Test it in Google's Rich Results Test."],
            effort=PROJECT,
        ))

    # 4. Service and town named together (2)
    paired = [h for h in heads if city and city in h.lower() and any(w in h.lower() for words in SERVICE_TERMS.values() for w in words)]
    if not city:
        add(Check("geo.pairing", "Your headings pair a service with a town", UNAVAILABLE, 2.0, reason="No town was given on the command line, so there was nothing to pair."))
    elif paired:
        add(Check("geo.pairing", "Your headings pair a service with a town", PASS, 2.0, points=2.0, detail="e.g. \"%s\"." % truncate(paired[0], 70)))
    else:
        add(Check(
            "geo.pairing", "Your headings pair a service with a town", FAIL, 2.0,
            detail="No heading names both a service and your town.",
            fix="Write headings that pair the two: \"Dementia care in %s\"." % site.location.city,
            steps=[
                "For each service page, make the heading \"<service> in <town>\".",
                "Do it for the two or three towns that actually matter, not for fifty — a page per town with nothing new on it is a page nobody ranks.",
            ],
            effort=PROJECT,
        ))

    # 5. A number, not a promise to discuss one (2)
    has_number = any(w in text for w in ("per hour", "hourly rate", "an hour", "$"))
    talks_cost = any(w in text for w in COST_TERMS)
    if has_number and talks_cost:
        add(Check("geo.cost_answer", "Your site says what an hour of care costs", PASS, 2.0, points=2.0, detail="Cost is discussed with actual figures."))
    else:
        add(Check(
            "geo.cost_answer", "Your site says what an hour of care costs", FAIL, 2.0,
            detail="Your site raises the subject of cost but never gives a figure." if talks_cost else "Your site does not mention what care costs.",
            fix="Give an hourly range. \"Contact us for pricing\" is not an answer an assistant can repeat.",
            steps=[
                "Add: \"Home care in %s typically costs $X to $Y an hour.\"" % (site.location.city or "our area"),
                "Explain what changes the number — hours per week, level of care, overnight.",
                "This is the most-asked question of every AI assistant about home care, and the one most agency sites refuse to answer.",
            ],
        ))

    # 6. Content is text, not pictures of text (2)
    body_words = len(site.home.text.split())
    if body_words >= 300:
        add(Check("geo.readable", "Your pages have enough readable text", PASS, 2.0, points=2.0, detail="Your homepage carries about %d words of text." % body_words))
    elif body_words >= 120:
        add(Check(
            "geo.readable", "Your pages have enough readable text", WARN, 2.0, points=1.0,
            detail="Your homepage has only about %d words of readable text." % body_words,
            fix="Say more, in text. An assistant cannot read a picture or a video.",
            steps=["Add two or three short paragraphs of plain text.", "Move any words that only exist inside an image into the page itself."],
        ))
    else:
        add(Check(
            "geo.readable", "Your pages have enough readable text", FAIL, 2.0,
            detail="Your homepage has almost no readable text (about %d words)." % body_words,
            fix="Put your message on the page as text.",
            steps=[
                "Write 300+ words of plain text on the homepage: who you are, where you work, what you do, what it costs.",
                "If it is currently inside images, a slider or a video, it does not exist to a search engine or an assistant.",
            ],
            effort=PROJECT,
        ))

    # 7. Something dated and recent (1)
    blog = site.page_for("blog")
    years = re.findall(r"\b(20[12]\d)\b", " ".join(p.text for p in site.all_pages))
    import datetime

    this_year = datetime.date.today().year
    fresh = any(int(y) >= this_year - 1 for y in years)
    if blog and fresh:
        add(Check("geo.fresh", "Something on your site is recent and dated", PASS, 1.0, points=1.0, detail="You publish, and there are dates from the last year or two."))
    else:
        add(Check(
            "geo.fresh", "Something on your site is recent and dated", FAIL if not fresh else WARN, 1.0, points=0.0 if not fresh else 0.5,
            detail="Nothing on your site carries a recent date." if not fresh else "There are recent dates but no article section we could find.",
            fix="Publish something dated, a few times a year.",
            steps=[
                "Write one short piece a quarter answering a real question — \"How to know when a parent needs help at home\".",
                "Show the date. A site with no dates on it looks abandoned to a machine deciding whether to trust it.",
            ],
            effort=ONGOING,
        ))

    return module


# --------------------------------------------------------------------------------------
# Assembling and printing
# --------------------------------------------------------------------------------------


@dataclass
class Audit:
    agency: str
    url: str
    location: Location
    modules: List[Module]
    notes: List[str] = field(default_factory=list)
    blocked: List[str] = field(default_factory=list)
    pages_read: List[str] = field(default_factory=list)
    generated_at: str = ""

    @property
    def scorable(self) -> List[Module]:
        return [m for m in self.modules if m.is_scorable]

    @property
    def not_scored(self) -> List[Module]:
        return [m for m in self.modules if not m.is_scorable]

    @property
    def total(self) -> float:
        weights = sum(m.weight for m in self.scorable)
        if not weights:
            return 0.0
        return round(100.0 * sum(m.weighted for m in self.scorable) / weights, 1)

    @property
    def band(self) -> Tuple[str, str]:
        return band_for(self.total)

    def recommendations(self) -> List[Tuple[Check, Module]]:
        items = [(c, m) for m in self.modules for c in m.checks if c.status in (FAIL, WARN) and c.fix]
        order = {QUICK: 0, PROJECT: 1, ONGOING: 2}
        items.sort(key=lambda pair: (order.get(pair[0].effort, 3), -pair[0].recoverable))
        return items

    def unavailable(self) -> List[Tuple[Check, Module]]:
        return [(c, m) for m in self.modules for c in m.checks if c.status == UNAVAILABLE]


class Painter:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled

    def __call__(self, text: str, *styles: str) -> str:
        if not self.enabled or not styles:
            return text
        return "".join(ANSI.get(s, "") for s in styles) + text + ANSI["reset"]


def print_report(audit: Audit, paint: Painter, width: int = 84) -> None:
    out = sys.stdout.write
    band_label, band_colour = audit.band

    out("\n" + paint("=" * width, "dim") + "\n")
    out(paint("  %s" % audit.agency, "bold") + "\n")
    out("  Local search & AI visibility audit for a home care agency\n")
    out(paint("  %s  ·  %s  ·  %s" % (audit.url, audit.location, audit.generated_at), "dim") + "\n")
    out(paint("=" * width, "dim") + "\n\n")

    out("  %s   %s\n" % (paint("%.0f / 100" % audit.total, "bold", band_colour), paint(band_label, band_colour)))
    if audit.not_scored:
        names = ", ".join(m.label for m in audit.not_scored)
        out(paint("  Scored on what we could check. Not scored: %s.\n" % names, "dim"))
    out("\n")

    # Modules
    out(paint("  YOUR SCORE, AREA BY AREA\n", "bold"))
    for module in audit.modules:
        percent = module.percent
        bar_width = 26
        if percent is None:
            bar = paint("·" * bar_width, "grey")
            score = paint("not scored", "grey")
        else:
            filled = int(round(bar_width * percent / 100.0))
            bar = paint("█" * filled, module.indicator) + paint("░" * (bar_width - filled), "dim")
            score = "%4.1f / %-4.0f" % (module.weighted, module.weight)
        out("  %-34s %s  %s\n" % (truncate(module.label, 34), bar, score))
        note = module.score_note
        if note:
            # This used to be a handful of words, so nothing wrapped it, and the franchise
            # mismatch then printed a 500-character line straight off the side of the
            # terminal. The summary keeps the first sentence — the surprise — and sends the
            # reader to the area below for the rest, rather than putting seven lines of
            # paragraph inside a five-row table.
            indent = " " * 37
            if len(note) > 96:
                note = _first_sentence(note) + " See the detail below."
            out(paint("%s%s\n" % (indent, _wrap(note, width - 37, indent)), "dim"))
    out("\n")

    # Fix list
    recommendations = audit.recommendations()
    out(paint("  WHAT TO DO NEXT", "bold") + paint("  (quick wins first, then bigger projects, then ongoing work)\n", "dim"))
    if not recommendations:
        out("  Nothing needs fixing in what we could check.\n")
    for index, (check, module) in enumerate(recommendations, 1):
        head = "  %2d. %s" % (index, check.fix or check.label)
        out(paint(head, "bold") + "\n")
        meta = "      %s · %s · worth about %s" % (module.label, check.effort, ("%.1f points" % check.recoverable) if check.recoverable else "no points directly")
        out(paint(meta, "dim") + "\n")
        if check.detail:
            out("      %s\n" % _wrap(check.detail, width - 8, "      "))
        for step_no, step in enumerate(check.steps, 1):
            out("      %s %s\n" % (paint("%d." % step_no, "dim"), _wrap(step, width - 10, "         ")))
        out("\n")

    # Detail
    out(paint("  EVERY CHECK\n", "bold"))
    for module in audit.modules:
        out("\n  %s %s\n" % (paint(module.label, "bold"), paint("(%s)" % ("not scored" if module.percent is None else "%.1f of %.0f points" % (module.weighted, module.weight)), "dim")))
        out(paint("  %s\n" % _wrap(module.blurb, width - 4, "  "), "dim"))
        shared = module.shared_reason
        if shared:
            out(paint("  %s\n" % _wrap(shared, width - 4, "  "), "dim"))
        for check in module.checks:
            mark = paint("%-14s" % STATUS_LABEL[check.status], STATUS_COLOR[check.status])
            if check.status == UNAVAILABLE:
                worth = "%s set aside" % _points(check.max_points)
            else:
                worth = "%s / %s" % (_number(check.points), _points(check.max_points))
            # The column has to fit the longest label, or a nowrap cut lands mid-word and
            # reads as a rendering bug rather than as a shortened label.
            out("   %s %-48s %s\n" % (mark, truncate(check.label, 48), paint(worth, "dim")))
            body = check.detail or check.reason
            if body.strip() == shared:
                body = ""  # already said once, above the list
            if body:
                out("                  %s\n" % paint(_wrap(body, width - 18, "                  "), "dim"))

    # Honesty
    unavailable = audit.unavailable()
    if unavailable or audit.notes or audit.blocked:
        out("\n" + paint("  WHAT WE COULD NOT CHECK\n", "bold"))
        out(paint("  None of this counted against your score — the points left the total instead.\n\n", "dim"))
        # Grouped by reason, not listed per check: eleven checks knocked out by one franchise
        # mismatch printed the same paragraph eleven times, which buried the eleven labels
        # that were the only thing varying.
        grouped: List[Tuple[str, List[str]]] = []
        for check, module in unavailable:
            reason = (check.reason or "No reason recorded.").strip()
            for existing_reason, labels in grouped:
                if existing_reason == reason:
                    labels.append(check.label)
                    break
            else:
                grouped.append((reason, [check.label]))
        for reason, labels in grouped:
            for label in labels:
                out("  · %s\n" % label)
            out("    %s\n" % paint(_wrap(reason, width - 6, "    "), "dim"))
        for note in audit.notes:
            out("  · %s\n" % paint(note, "dim"))
        for link in audit.blocked:
            out("  · %s\n" % paint("robots.txt asked us not to read %s, so we did not." % link, "dim"))

    # Paths, not whole URLs. Every page of a franchise office shares a long prefix, so a
    # list of truncated URLs printed the same forty characters eight times over.
    host = urlparse(audit.url).netloc
    paths = [urlparse(u).path or "/" for u in audit.pages_read]
    shown = _wrap("%s — %s" % (host, ", ".join(paths)), width - 16, "              ")
    out("\n" + paint("  Pages read: %s\n" % (shown or "none"), "dim"))
    out(paint("  home_care_agent %s\n\n" % VERSION, "dim"))


def _path_of(url: str) -> str:
    """A page's path, for printing. The host is on the cover; repeating it wastes the line."""
    parsed = urlparse(url)
    return (parsed.path or "/") if parsed.netloc else url


def _number(value: float) -> str:
    return ("%.1f" % value).rstrip("0").rstrip(".") if value % 1 else "%d" % value


def _points(value: float) -> str:
    return "%s %s" % (_number(value), "pt" if value == 1 else "pts")


def _wrap(text: str, width: int, indent: str) -> str:
    import textwrap

    # Neither hyphens nor long words may be broken: everything wrapped here that is not
    # prose is a URL or a path, and "virginia-\nbeach/care-services" is not a link anyone
    # can click or read back over the phone.
    lines = textwrap.wrap(squash(text), max(30, width), break_on_hyphens=False, break_long_words=False)
    return ("\n" + indent).join(lines) if lines else ""


def to_dict(audit: Audit) -> dict:
    return {
        "tool": "home_care_agent",
        "version": VERSION,
        "agency": audit.agency,
        "url": audit.url,
        "location": {"city": audit.location.city, "state": audit.location.state, "zip": audit.location.zip_code},
        "generatedAt": audit.generated_at,
        "totalScore": audit.total,
        "band": audit.band[0],
        "modulesNotScored": [m.label for m in audit.not_scored],
        "modules": [
            {
                "id": m.id,
                "label": m.label,
                "weight": m.weight,
                "points": m.weighted,
                "percent": m.percent,
                "indicator": m.indicator,
                "notScoredReason": m.unscorable_reason or None,
                "pointsVisible": m.scorable_max,
                "checks": [
                    {
                        "id": c.id, "label": c.label, "status": c.status,
                        "points": c.points, "maxPoints": c.max_points,
                        "detail": c.detail, "fix": c.fix, "steps": c.steps,
                        "effort": c.effort, "unavailableReason": c.reason,
                    }
                    for c in m.checks
                ],
            }
            for m in audit.modules
        ],
        "recommendations": [
            {
                "rank": i, "module": m.label, "fix": c.fix, "why": c.detail,
                "steps": c.steps, "effort": c.effort, "pointsRecoverable": c.recoverable,
            }
            for i, (c, m) in enumerate(audit.recommendations(), 1)
        ],
        "couldNotCheck": [{"check": c.label, "reason": c.reason} for c, _ in audit.unavailable()],
        "pagesRead": audit.pages_read,
        "notes": audit.notes,
    }


def to_markdown(audit: Audit) -> str:
    band_label, _ = audit.band
    lines = [
        "# %s — local search & AI visibility" % audit.agency,
        "",
        "**%.0f / 100 — %s**  " % (audit.total, band_label),
        "%s · %s · %s" % (audit.url, audit.location, audit.generated_at),
        "",
    ]
    if audit.not_scored:
        lines += ["> Scored on what we could check. Not scored: %s." % ", ".join(m.label for m in audit.not_scored), ""]
    # The notes column only earns its place when something is in it.
    noted = any(m.score_note for m in audit.modules)
    lines += (["| Area | Score | What to know |", "| --- | --- | --- |"] if noted
              else ["| Area | Score |", "| --- | --- |"])
    for module in audit.modules:
        value = "not scored" if module.percent is None else "%.1f / %.0f" % (module.weighted, module.weight)
        row = "| %s | %s |" % (module.label, value)
        lines.append(row + (" %s |" % module.score_note if noted else ""))
    lines += ["", "## What to do next", ""]
    for index, (check, module) in enumerate(audit.recommendations(), 1):
        lines.append("### %d. %s" % (index, check.fix))
        lines.append("*%s · %s · worth about %.1f points*" % (module.label, check.effort, check.recoverable))
        lines.append("")
        if check.detail:
            lines += [check.detail, ""]
        for step in check.steps:
            lines.append("- %s" % step)
        lines.append("")
    unavailable = audit.unavailable()
    if unavailable:
        lines += ["## What we could not check", "", "None of this counted against the score — the points left the total instead.", ""]
        for check, _ in unavailable:
            lines.append("- **%s** — %s" % (check.label, check.reason))
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------


def build_audit(agency: str, url: str, location_text: str, args: argparse.Namespace) -> Optional[Audit]:
    import datetime

    location = parse_location(location_text)
    fetcher = Fetcher(use_cache=not args.no_cache, use_browser=not args.no_browser, quiet=args.quiet)
    try:
        site = crawl(url, agency, location, fetcher, args.quiet)
        if site is None:
            # Say what went wrong, not what usually goes wrong. Advising an operator to
            # install playwright when playwright is already installed sends them off after
            # the wrong thing entirely.
            reason = fetcher.last_error or "the site did not respond"
            sys.stderr.write("\nCould not read %s — %s.\n" % (url, reason))
            if fetcher.blocked:
                sys.stderr.write("That page is disallowed by the site's robots.txt, so we did not fetch it.\n")
            elif "does not exist" in reason:
                # We already know the domain is the problem. Following that with the generic
                # "check the address and that the site is reachable" says it a second time
                # and adds a possibility we have already ruled out.
                sys.stderr.write("Check the spelling, and whether the site sits on www or another domain.\n")
            else:
                try:
                    import playwright  # type: ignore  # noqa: F401

                    sys.stderr.write("Check the address is right and that the site is reachable from this machine.\n")
                except Exception:
                    sys.stderr.write(
                        "Check the address. If the site builds itself with JavaScript or blocks plain requests,\n"
                        "install the browser too: pip install playwright && playwright install chromium\n"
                    )
            return None

        listing = fetch_listing(agency, location, site.home.url, args.quiet)
        # A listing in another state belongs to another office. Both modules that read a
        # listing key off listing.reason, so setting it here is what stops us scoring it.
        mismatch = listing_market_mismatch(listing, location)
        if mismatch:
            listing.reason = mismatch
            log("The listing found is in another state — not scoring it as yours", args.quiet)
        citations, searched = find_citations(agency, location, args.quiet)
        yelp = fetch_yelp(agency, location)

        modules = [
            module_google(site, listing),
            module_citations(site, citations, searched, yelp),
            module_website(site),
            module_reviews(site, listing, yelp),
            module_geo(site),
        ]

        # A module's checks must add up to its weight. When they do not, the rescale in
        # Module.weighted silently papers over it: the reviews checks once totalled 18
        # against a weight of 15, so the printed column added to 11 while the module header
        # said 9.2 of 15, and anyone checking the arithmetic found it wrong. Cheap to assert,
        # invisible when it drifts.
        #
        # This sees only the checks *this* run added, so a wrong weight in a branch this
        # agency did not take rides along undetected — proven by raising one recency branch
        # to 4.0 and watching a full audit finish clean. `--self-test` reads the source and
        # catches that class; this catches the run in front of us.
        for module in modules:
            declared = round(sum(c.max_points for c in module.checks), 2)
            if declared != module.weight:
                raise AssertionError(
                    "module %r declares %s points of checks against a weight of %s — fix the check weights"
                    % (module.id, declared, module.weight)
                )

        notes = list(fetcher.notes)
        if fetcher._browser is None and not args.no_browser:
            try:
                import playwright  # type: ignore  # noqa: F401
            except Exception:
                notes.append("Playwright is not installed, so pages were read without a browser. A site that builds itself with JavaScript will score lower than it deserves; install it with: pip install playwright && playwright install chromium")

        return Audit(
            agency=agency,
            url=site.home.url,
            location=location,
            modules=modules,
            notes=notes,
            blocked=fetcher.blocked,
            pages_read=[p.url for p in site.all_pages],
            generated_at=datetime.datetime.now().strftime("%B %d, %Y"),
        )
    finally:
        fetcher.close()


def self_test() -> int:
    """Check the scoring weights by reading this file, not by running an audit.

    Most checks are written as a branch per outcome — pass, warn, fail, couldn't-check —
    and each branch states the check's max_points again. The per-run assertion in
    build_audit only sees the branch that ran, so a branch weighted 4.0 where its siblings
    say 3.0 stays hidden until some future agency happens to take it, and then that agency's
    module quietly totals more than its weight. One outcome must not be worth more than
    another simply because the operator's reviews were fresher, so every branch of a check
    has to declare the same number.

    Fragment-splitting on "Check(" rather than one big regex: a label can contain a comma,
    a percent placeholder or a quote, and a pattern loose enough to skip past all of those
    is loose enough to run on into the next check and pair an id with a stranger's weight.
    """
    try:
        with open(os.path.abspath(__file__), "r", encoding="utf-8") as handle:
            source = handle.read()
    except OSError as error:
        sys.stderr.write("Could not read own source: %s\n" % error)
        return 2

    weights: Dict[str, Dict[str, List[int]]] = {}
    line_of = lambda offset: source.count("\n", 0, offset) + 1  # noqa: E731
    for match in re.finditer(r"\bCheck\(", source):
        start = match.end()
        following = source.find("Check(", start)
        fragment = source[start:following if following != -1 else len(source)]
        id_match = re.match(r'\s*"([\w.]+)"\s*,', fragment)
        if not id_match:
            continue  # id comes from a variable — the citation loop builds one per directory
        weight_match = re.search(r"\b(?:PASS|WARN|FAIL|UNAVAILABLE)\s*,\s*(\d+(?:\.\d+)?)", fragment)
        if not weight_match:
            continue
        weights.setdefault(id_match.group(1), {}).setdefault(weight_match.group(1), []).append(
            line_of(start)
        )

    disagreements = {cid: seen for cid, seen in weights.items() if len(seen) > 1}
    for cid in sorted(disagreements):
        sys.stderr.write("%s declares more than one weight:\n" % cid)
        for weight in sorted(disagreements[cid], key=float):
            lines = ", ".join("line %d" % n for n in disagreements[cid][weight])
            sys.stderr.write("    %s points at %s\n" % (weight, lines))

    declarations = sum(len(lines) for seen in weights.values() for lines in seen.values())
    if disagreements:
        sys.stderr.write(
            "\n%d of %s inconsistent. Every branch of a check must be worth the same.\n"
            % (len(disagreements), plural(len(weights), "check"))
        )
        return 1

    sys.stdout.write(
        "Weights consistent: %s across %s, every branch agreeing.\n"
        % (plural(len(weights), "check"), plural(declarations, "declaration"))
    )
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    if "--self-test" in (list(argv) if argv is not None else sys.argv[1:]):
        # Handled before parse_args: the audit's agency and url are required positionals,
        # and a check on the source needs neither.
        return self_test()

    parser = argparse.ArgumentParser(
        prog="home_care_agent.py",
        description="Audit a home care agency's local search and AI visibility, and print a prioritised fix list.",
        epilog='example: python home_care_agent.py "Comfort Keepers" "https://www.comfortkeepers.com/offices/virginia/virginia-beach/" "Virginia Beach VA 23454"',
    )
    parser.add_argument("agency", help="the agency's name, as it appears on its Google listing")
    parser.add_argument("url", help="the agency's website or office page")
    parser.add_argument("location", nargs="?", default="", help='"City, ST ZIP"')
    parser.add_argument("--json", dest="json_path", metavar="PATH", help="also write the full result as JSON")
    parser.add_argument("--markdown", dest="md_path", metavar="PATH", help="also write the report as markdown")
    parser.add_argument("--no-cache", action="store_true", help="ignore the 24-hour cache and refetch everything")
    parser.add_argument("--no-browser", action="store_true", help="never use playwright, even if it is installed")
    parser.add_argument("--no-color", action="store_true", help="plain text output")
    parser.add_argument("--quiet", "-q", action="store_true", help="no progress lines")
    parser.add_argument("--self-test", action="store_true", help="check the scoring weights and exit")
    args = parser.parse_args(argv)

    url, url_note = normalize_url(args.url)
    if url_note:
        log(url_note, args.quiet)
    load_dotenv()

    keys = {
        "Google Places": bool(os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()),
        "Serper": bool(os.environ.get("SERPER_API_KEY", "").strip()),
        "Yelp": bool(os.environ.get("YELP_API_KEY", "").strip()),
    }
    if not args.quiet:
        have = ", ".join(name for name, present in keys.items() if present) or "none"
        log("API keys available: %s" % have)
        if not all(keys.values()):
            log("Missing keys mean whole areas are reported \"couldn't check\" rather than scored.")

    audit = build_audit(args.agency, url, args.location, args)
    if audit is None:
        return 1

    paint = Painter(enabled=not args.no_color and sys.stdout.isatty())
    print_report(audit, paint)

    if args.json_path:
        with open(args.json_path, "w", encoding="utf-8") as handle:
            json.dump(to_dict(audit), handle, indent=2)
        log("wrote %s" % args.json_path, args.quiet)
    if args.md_path:
        with open(args.md_path, "w", encoding="utf-8") as handle:
            handle.write(to_markdown(audit))
        log("wrote %s" % args.md_path, args.quiet)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.stderr.write("\nstopped\n")
        sys.exit(130)
