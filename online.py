"""Public image search and video sources for DNF Lab."""
import json
import os
import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

BRAVE_THUMBNAILS = "imgs.search.brave.com"
BROWSER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                 "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
BRAVE_ORIGINAL = re.compile(
    r'thumbnail:\{src:("(?:\\.|[^"\\])*")[^{}]{0,600}?original:("(?:\\.|[^"\\])*")'
)


def public_url(value):
    parsed = urlsplit(value)
    return (parsed.scheme in ("http", "https") and parsed.hostname
            and not parsed.username and not parsed.password)


class BraveImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = {}

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        attrs = dict(attrs)
        rank = attrs.get("data-rank", "")
        src = attrs.get("src", "")
        if rank.isdecimal() and int(rank) < 10 and urlsplit(src).hostname == BRAVE_THUMBNAILS:
            self.images.setdefault(int(rank), {"thumbnail": src, "title": attrs.get("alt", "")})


def search_photos(name):
    name = name.strip()
    if not name or len(name) > 120:
        raise ValueError("Enter an athlete name.")
    query = name + " freediving"
    key = os.environ.get("DNF_BRAVE_API_KEY")
    if key:
        request = Request("https://api.search.brave.com/res/v1/images/search?" +
                          urlencode({"q": query, "count": 10, "safesearch": "strict"}),
                          headers={"X-Subscription-Token": key, "Accept": "application/json"})
        with urlopen(request, timeout=12) as response:
            result = json.load(response)
        images = [
            {"thumbnail": item["thumbnail"]["src"], "title": item.get("title", ""),
             "original": item.get("properties", {}).get("url", "")}
            for item in result.get("results", [])[:10]
            if public_url(item.get("thumbnail", {}).get("src", ""))
        ]
    else:
        url = "https://search.brave.com/images?" + urlencode({"q": query.lower()})
        try:
            response = subprocess.run(
                ["curl", "-q", "--fail", "--silent", "--location", "--max-time", "12",
                 "--max-filesize", "3000000", "--proto", "=https", "--proto-redir", "=https",
                 "--user-agent", BROWSER_AGENT, url],
                capture_output=True, check=True, timeout=14,
            )
        except subprocess.SubprocessError as error:
            raise OSError("Public image results unavailable") from error
        html = response.stdout.decode("utf-8", errors="replace")
        parser = BraveImages()
        parser.feed(html)
        images = [value for _, value in sorted(parser.images.items())]
        if not images and "data-rank=" not in html:
            raise OSError("Public image results unavailable")
        originals = {json.loads(match[1]): json.loads(match[2]) for match in BRAVE_ORIGINAL.finditer(html)}
        for image in images:
            original = originals.get(image["thumbnail"], "")
            if public_url(original):
                image["original"] = original
    return {"query": query, "images": images}


def sportall(query, variables, application_id):
    request = Request(
        "https://service-platform.sportall.tv/graphql",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "X-Application-Id": application_id},
    )
    with urlopen(request, timeout=12) as response:
        result = json.load(response)
    return result.get("data") or {}


def online_video(value):
    if len(value) > 2000 or not public_url(value):
        raise ValueError("Enter a valid video URL.")
    parsed = urlsplit(value)
    if parsed.hostname != "tv.cmas.org":
        raise ValueError("Use a CMAS TV replay or a direct MP4, WebM or HLS link.")
    match = re.fullmatch(r"/sportitem/([0-9a-fA-F]{24})/?", parsed.path)
    if not match:
        raise ValueError("Enter the link to a CMAS TV replay.")
    application_id = os.environ.get("DNF_CMAS_APPLICATION_ID", "").strip()
    if not application_id:
        raise ValueError("Set DNF_CMAS_APPLICATION_ID to enable CMAS TV replay links.")
    item_id = match[1]
    item = sportall("""
        query DnfVideo($id: ID!) {
          sportItem(id: $id) {
            title premiumLocked legal { blocked } lockedByUserLocation
            accessRequiresUserAuthentication mediaToRead { id title }
          }
        }
    """, {"id": item_id}, application_id).get("sportItem")
    if not item:
        raise ValueError("CMAS TV could not find this replay.")
    if (item.get("premiumLocked") or (item.get("legal") or {}).get("blocked")
            or item.get("lockedByUserLocation") or item.get("accessRequiresUserAuthentication")):
        raise ValueError("Open this restricted replay on CMAS TV.")
    media = item.get("mediaToRead")
    if not media:
        raise ValueError("CMAS TV has no playable media for this replay.")
    playback = sportall("""
        mutation DnfPlayback($input: GenerateSportItemMediaPlaybackUrlInput!) {
          generateSportItemMediaPlaybackUrl(input: $input) { url access }
        }
    """, {"input": {"sportItemId": item_id, "mediaId": media["id"]}}, application_id)
    result = playback.get("generateSportItemMediaPlaybackUrl") or {}
    source = result.get("url") or ""
    if result.get("access") != "Granted" or not public_url(source):
        raise ValueError("CMAS TV did not grant playback for this replay.")
    return {"source": source, "title": item.get("title") or media.get("title") or "CMAS TV"}
