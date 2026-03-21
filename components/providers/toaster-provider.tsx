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
};

export const ToasterProvider = () => {
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use((config) => {
      const trackedConfig = config as typeof config & AxiosConfigWithLoadingId;
      trackedConfig.__loadingToastRequestId = beginTrackedLoading();
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
      const requestId = beginTrackedLoading();

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
