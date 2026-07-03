import type {
  SearchProviderHealth,
  SearchProviderId,
  SearchRequest,
  SearchRequestInput,
  SearchResponse,
} from "@pap/contracts";

export interface SearchProvider {
  readonly id: SearchProviderId;

  health(): Promise<SearchProviderHealth>;

  search(request: SearchRequest): Promise<SearchResponse>;
}

export interface SearchService {
  search(request: SearchRequestInput): Promise<SearchResponse>;
  getProviderHealth(providerId: SearchProviderId): Promise<SearchProviderHealth>;
  listProviderHealth(): Promise<SearchProviderHealth[]>;
}
