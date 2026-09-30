import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api, API_BASE_URL } from '../api/client';

export interface RestaurantBranchBranding {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface RestaurantBrandingContextValue {
  branch: RestaurantBranchBranding | null;
  logoUrl: string | null;
  branchName: string | null;
  refreshBranding: (branchId?: string) => Promise<void>;
}

const RestaurantBrandingContext =
  createContext<RestaurantBrandingContextValue | null>(null);

const SELECTED_BRANCH_KEY = 'selected_branch_id';

const API_ROOT = API_BASE_URL.replace(/\/api\/?$/, '');

function resolveLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl) {
    return null;
  }

  if (
    logoUrl.startsWith('http://') ||
    logoUrl.startsWith('https://')
  ) {
    return logoUrl;
  }

  return `${API_ROOT}${logoUrl}`;
}

export function RestaurantBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branch, setBranch] =
    useState<RestaurantBranchBranding | null>(null);

  const refreshBranding = useCallback(
    async (requestedBranchId?: string) => {
      try {
        const response = await api.get('/branches');

        const branches = (
          response.data?.branches ??
          response.data ??
          []
        ) as RestaurantBranchBranding[];

        if (!Array.isArray(branches) || branches.length === 0) {
          setBranch(null);
          return;
        }

        const storedBranchId =
          localStorage.getItem(SELECTED_BRANCH_KEY);

        const branchId =
          requestedBranchId ||
          storedBranchId ||
          '';

        let selectedBranch =
          branches.find(
            (item) => item.id === branchId,
          );

        if (!selectedBranch) {
          selectedBranch = branches.find(
            (item) => item.logoUrl,
          );
        }

        if (!selectedBranch) {
          selectedBranch = branches[0];
        }

        setBranch(selectedBranch);
      } catch (error) {
        console.error(
          'Failed to load restaurant branding:',
          error,
        );
      }
    },
    [],
  );

  useEffect(() => {
    void refreshBranding();

    function handleBranchChanged(
      event: Event,
    ) {
      const customEvent =
        event as CustomEvent<{
          branchId?: string;
        }>;

      void refreshBranding(
        customEvent.detail?.branchId,
      );
    }

    function handleBrandingChanged() {
      void refreshBranding();
    }

    window.addEventListener(
      'branchChanged',
      handleBranchChanged,
    );

    window.addEventListener(
      'restaurantBrandingChanged',
      handleBrandingChanged,
    );

    return () => {
      window.removeEventListener(
        'branchChanged',
        handleBranchChanged,
      );

      window.removeEventListener(
        'restaurantBrandingChanged',
        handleBrandingChanged,
      );
    };
  }, [refreshBranding]);

  const value: RestaurantBrandingContextValue = {
    branch,
    logoUrl: resolveLogoUrl(
      branch?.logoUrl ?? null,
    ),
    branchName: branch?.name ?? null,
    refreshBranding,
  };

  return (
    <RestaurantBrandingContext.Provider
      value={value}
    >
      {children}
    </RestaurantBrandingContext.Provider>
  );
}

export function useRestaurantBranding() {
  const context = useContext(
    RestaurantBrandingContext,
  );

  if (!context) {
    throw new Error(
      'useRestaurantBranding must be used inside RestaurantBrandingProvider',
    );
  }

  return context;
}