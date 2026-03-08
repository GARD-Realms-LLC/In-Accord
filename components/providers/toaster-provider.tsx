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

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const requestId = beginTrackedLoading();

      return originalFetch(input, init).finally(() => {
        endTrackedLoading(requestId);
      });
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
      resetTrackedLoading();
    };
  }, []);

  return <Toaster position="top-center" closeButton={false} />;
};
