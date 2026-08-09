import type {
  BrowserAdapter,
  BrowserVerificationEvidence,
  BrowserVerificationProfile,
} from "./browser-types.js";

export class ControlledBrowserVerificationError extends Error {
  constructor(readonly reason: string) {
    super(`Controlled browser verification failed: ${reason}`);
    this.name = "ControlledBrowserVerificationError";
  }
}

export interface ControlledBrowserVerifier {
  verify(input: {
    profile: BrowserVerificationProfile;
    url: string;
  }): Promise<BrowserVerificationEvidence>;
}

export interface ControlledBrowserVerifierDependencies {
  adapter?: BrowserAdapter;
  now?: () => Date;
}

export function createControlledBrowserVerifier({
  adapter = createFetchBrowserAdapter(),
  now = () => new Date(),
}: ControlledBrowserVerifierDependencies = {}): ControlledBrowserVerifier {
  return {
    async verify(input) {
      const approvedUrl = validateLocalhostUrl(input.url, input.profile);
      const metadata = await adapter.verify({
        url: approvedUrl.href,
        expectedOrigin: approvedUrl.origin,
        timeoutMs: input.profile.navigationTimeoutMs,
      });
      const finalUrl = validateLocalhostUrl(metadata.url, input.profile);

      if (finalUrl.origin !== approvedUrl.origin) {
        throw new ControlledBrowserVerificationError("navigation left localhost origin");
      }

      const pageTitle =
        metadata.pageTitle === undefined
          ? undefined
          : sanitizePageTitle(metadata.pageTitle);

      return {
        status: "PASSED",
        url: approvedUrl.href,
        ...(pageTitle === undefined || pageTitle === "" ? {} : { pageTitle }),
        verifiedAt: now().toISOString(),
      };
    },
  };
}

export function createFetchBrowserAdapter({
  fetchImpl = globalThis.fetch,
}: { fetchImpl?: typeof fetch } = {}): BrowserAdapter {
  return {
    async verify(input) {
      let response: Response;

      try {
        response = await fetchImpl(input.url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(input.timeoutMs),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ControlledBrowserVerificationError("browser navigation timed out");
        }

        throw new ControlledBrowserVerificationError("browser navigation failed");
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");

        if (location === null) {
          throw new ControlledBrowserVerificationError("browser redirect is invalid");
        }

        const redirected = new URL(location, input.url);

        if (redirected.origin !== input.expectedOrigin) {
          throw new ControlledBrowserVerificationError("browser redirected externally");
        }

        throw new ControlledBrowserVerificationError("browser redirect was not followed");
      }

      if (!response.ok) {
        throw new ControlledBrowserVerificationError("browser navigation failed");
      }

      const html = await response.text();

      if (!/<html[\s>]/i.test(html)) {
        throw new ControlledBrowserVerificationError("document was not rendered");
      }

      return {
        url: response.url || input.url,
        pageTitle: extractTitle(html),
      };
    },
  };
}

export function localhostUrlForProfile(profile: BrowserVerificationProfile): string {
  return `http://${profile.host}:${profile.port}${profile.path}`;
}

export function validateLocalhostUrl(
  value: string,
  profile: BrowserVerificationProfile,
): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ControlledBrowserVerificationError("invalid localhost URL");
  }

  if (
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== String(profile.port) ||
    url.pathname !== profile.path ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new ControlledBrowserVerificationError("localhost URL is not approved");
  }

  if (url.hostname !== profile.host && !(profile.host === "127.0.0.1" && url.hostname === "localhost")) {
    throw new ControlledBrowserVerificationError("localhost host is not approved");
  }

  return url;
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  if (match === null) {
    return undefined;
  }

  return sanitizePageTitle(decodeBasicEntities(match[1]));
}

function sanitizePageTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
