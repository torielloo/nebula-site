import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
			staleTime: 15_000,
			retry: (failureCount, error) => {
				const status = Number(error?.response?.status || error?.status || 0);
				if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
				return failureCount < 2;
			},
			retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
		},
	},
});