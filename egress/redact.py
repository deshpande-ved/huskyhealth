"""mitmweb addon: hide API keys in mitmweb's copy of each request, so the UI can be shown on screen.

The key is blanked only after the request has gone out (response or error), so Gradium and Anthropic still get it.
While a request is still in flight, its headers are not yet redacted: open a flow once it has finished.
"""
SECRET_HEADERS = ("x-api-key", "authorization")


def _redact(flow) -> None:
    for name in SECRET_HEADERS:
        if name in flow.request.headers:
            flow.request.headers[name] = "[hidden]"


def response(flow) -> None:
    _redact(flow)


def error(flow) -> None:
    _redact(flow)
