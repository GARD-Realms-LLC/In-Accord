"use client";

import { useEffect } from "react";
import axios from "axios";
import { Toaster } from "sonner";

import {
  beginTrackedLoading,
  endTrackedLoading,
  resetTrackedLoading,
} from "@/lib/loading-toast-manager";

type AxiosConfigWithLoadingId = {
  __loadingToastRequestId?: symbol;
  inaccordTrackLoading?: boolean;
};

const TRACK_LOADING_HEADER = "x-inaccord-track-loading";

const shouldTrackRequestMethod = (method: unknown) => {
  const normalizedMethod = String(method ?? "GET").trim().toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);
};

const isTruthyTrackingValue = (value: unknown) => {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalizedValue);
};

const readHeadersTrackingValue = (headers: HeadersInit | undefined) => {
  if (!headers) {
    return false;
  }

  if (headers instanceof Headers) {
    return isTruthyTrackingValue(headers.get(TRACK_LOADING_HEADER));
  }

  if (Array.isArray(headers)) {
    const matched = headers.find(
      ([name]) => String(name).trim().toLowerCase() === TRACK_LOADING_HEADER
    );
    return isTruthyTrackingValue(matched?.[1]);
  }

  return isTruthyTrackingValue(
    (headers as Record<string, unknown>)[TRACK_LOADING_HEADER]
  );
};

const shouldTrackAxiosRequest = (config: AxiosConfigWithLoadingId & {
  method?: unknown;
  headers?: unknown;
}) => {
  if (!shouldTrackRequestMethod(config.method)) {
    return false;
  }

  return (
    config.inaccordTrackLoading === true ||
    readHeadersTrackingValue(config.headers as HeadersInit | undefined)
  );
};

const shouldTrackFetchRequest = (
  input: RequestInfo | URL,
  init?: RequestInit & { inaccordTrackLoading?: boolean },
) => {
  const requestMethod =
    init?.method ??
    (input instanceof Request ? input.method : "GET");

  if (!shouldTrackRequestMethod(requestMethod)) {
    return false;
  }

  return (
    init?.inaccordTrackLoading === true ||
    readHeadersTrackingValue(init?.headers) ||
    (input instanceof Request
      ? readHeadersTrackingValue(input.headers)
      : false)
  );
};

export const ToasterProvider = () => {
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use((config) => {
      const trackedConfig = config as typeof config & AxiosConfigWithLoadingId;
      trackedConfig.__loadingToastRequestId = shouldTrackAxiosRequest(trackedConfig)
        ? beginTrackedLoading()
        : undefined;
      return trackedConfig;
    });

    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        const trackedConfig = response.config as AxiosConfigWithLoadingId;
        endTrackedLoading(trackedConfig.__loadingToastRequestId);
        return response;
      },
      (error) => {
        const trackedConfig = error?.config as AxiosConfigWithLoadingId | undefined;
        endTrackedLoading(trackedConfig?.__loadingToastRequestId);
        return Promise.reject(error);
      }
    );

    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const trackedInit = init as (RequestInit & { inaccordTrackLoading?: boolean }) | undefined;
      const requestId = shouldTrackFetchRequest(input, trackedInit)
        ? beginTrackedLoading()
        : undefined;

      try {
        return await originalFetch(input, init);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(message)) {
          return new Response(JSON.stringify({ error: "Network request failed" }), {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "Content-Type": "application/json",
              "X-InAccord-Network-Error": "1",
            },
          });
        }

        throw error;
      } finally {
        endTrackedLoading(requestId);
      }
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
      resetTrackedLoading();
    };
  }, []);

  return (
    <Toaster
      position="top-center"
      closeButton
      toastOptions={{
        duration: Infinity,
        closeButton: true,
        classNames: {
          toast:
            "max-w-[calc(100vw-1rem)] w-[min(calc(100vw-1rem),32rem)] overflow-hidden break-words",
          content: "min-w-0 max-w-full overflow-hidden break-words",
          title: "break-words",
          description: "break-words",
        },
      }}
    />
  );
};
