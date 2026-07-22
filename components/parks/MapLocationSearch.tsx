"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SearchBox,
  type SearchBoxRefType,
} from "@mapbox/search-js-react";
import { AlertCircle, LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchFeature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    feature_type?: string;
    bbox?: [number, number, number, number];
  }
>;

type MapLocationSearchProps = {
  accessToken: string;
  clearRequest: number;
  proximity: { lng: number; lat: number } | null;
  onClear: () => void;
  onRetrieve: (feature: SearchFeature) => void;
};

const LUCIDE_SEARCH_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </svg>
`;

export function MapLocationSearch({
  accessToken,
  clearRequest,
  proximity,
  onClear,
  onRetrieve,
}: MapLocationSearchProps) {
  const searchBoxRef = useRef<SearchBoxRefType>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const theme = useMemo(
    () => ({
      variables: {
        colorText: "var(--foreground)",
        colorPrimary: "var(--primary)",
        colorSecondary: "var(--muted-foreground)",
        colorBackground: "var(--card)",
        colorBackgroundHover: "var(--muted)",
        colorBackgroundActive: "var(--accent)",
        border: "1px solid var(--border)",
        borderRadius: "0.625rem",
        boxShadow: "0 4px 14px rgb(0 0 0 / 0.14)",
        fontFamily: "var(--font-sans)",
        unit: "14px",
        padding: "0.75em",
      },
      icons: {
        search: LUCIDE_SEARCH_ICON,
      },
      cssText: `
        .Input {
          height: 44px;
          color: var(--foreground) !important;
        }
        .Input::placeholder {
          color: var(--muted-foreground);
          opacity: 1;
        }
        .Input:focus {
          border: 0;
          outline: 2px solid color-mix(in oklab, var(--ring) 55%, transparent);
          outline-offset: -2px;
        }
        .SearchIcon {
          color: var(--muted-foreground);
          fill: none;
        }
        .Results {
          max-height: min(18rem, 42dvh);
          overscroll-behavior: contain;
        }
      `,
    }),
    []
  );

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchBoxRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isExpanded]);

  useEffect(() => {
    if (clearRequest === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setValue("");
      setIsLoading(false);
      setMessage(null);
      setIsExpanded(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [clearRequest]);

  function clearAndCollapse() {
    setValue("");
    setIsLoading(false);
    setMessage(null);
    setIsExpanded(false);
    onClear();
  }

  if (!accessToken) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 rounded-full bg-card shadow-md"
        aria-label="Location search is unavailable"
        disabled
      >
        <Search aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div
      className="relative size-10"
      role="search"
      aria-label="Search geographic locations"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`size-10 rounded-full bg-card shadow-md transition-opacity duration-200 ${
          isExpanded ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-label="Search locations"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(true)}
      >
        <Search aria-hidden="true" />
      </Button>

      <div
        className={`fixed top-[calc(env(safe-area-inset-top)+4rem)] right-4 left-4 z-50 origin-top transition-[opacity,transform] duration-200 ease-out sm:absolute sm:top-0 sm:right-auto sm:left-0 sm:w-80 ${
          isExpanded
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        }`}
        aria-hidden={!isExpanded || undefined}
        inert={!isExpanded || undefined}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <SearchBox
              ref={searchBoxRef}
              accessToken={accessToken}
              value={value}
              placeholder="Search location"
              options={{
                language: "en",
                limit: 8,
                proximity: proximity ?? undefined,
              }}
              componentOptions={{
                allowReverse: false,
                flyTo: false,
              }}
              popoverOptions={{
                placement: "bottom-start",
                flip: false,
                offset: 6,
              }}
              theme={theme}
              onChange={(nextValue) => {
                setValue(nextValue);
                setMessage(null);
                setIsLoading(nextValue.trim().length >= 3);
              }}
              onSuggest={(response) => {
                setIsLoading(false);
                setMessage(
                  value.trim().length >= 3 &&
                    response.suggestions.length === 0
                    ? "No matching locations found."
                    : null
                );
              }}
              onSuggestError={() => {
                setIsLoading(false);
                setMessage("Location search is unavailable. Please try again.");
              }}
              onRetrieve={(response) => {
                setIsLoading(false);
                setMessage(null);

                const feature = response.features[0];
                if (feature) {
                  onRetrieve(feature);
                  setIsExpanded(false);
                } else {
                  setMessage("This location could not be opened.");
                }
              }}
              onClear={() => {
                setValue("");
                setIsLoading(false);
                setMessage(null);
                onClear();
              }}
            />

            {isLoading || message ? (
              <div
                className="flex w-fit max-w-full items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm"
                role="status"
                aria-live="polite"
              >
                {isLoading ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                )}
                {isLoading ? "Searching locations…" : message}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-full bg-card shadow-md"
            aria-label="Close location search"
            onClick={clearAndCollapse}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
