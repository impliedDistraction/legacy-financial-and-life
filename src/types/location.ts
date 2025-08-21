export interface LocationInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  parkingInfo?: string;
  notes?: string;
}

export interface MapProvider {
  name: string;
  requiresApiKey: boolean;
  apiKey?: string;
  embedUrl: string;
  directionsUrl: string;
}