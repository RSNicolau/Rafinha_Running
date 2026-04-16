'use client';

import { useEffect, useRef } from 'react';

interface PlaceResult {
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

interface AddressPickerProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    initGoogleMaps?: () => void;
  }
}

export default function AddressPicker({
  value, onChange, onPlaceSelected, placeholder = 'Digite o endereço...', className = '',
}: AddressPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const initAutocomplete = () => {
      if (!inputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'br' },
        fields: ['formatted_address', 'geometry', 'address_components', 'name'],
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.name || place.formatted_address || '';
        let city = '';
        let state = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        place.address_components?.forEach((c: any) => {
          if (c.types.includes('administrative_area_level_2')) city = c.long_name;
          if (c.types.includes('administrative_area_level_1')) state = c.short_name;
        });
        onChange(address);
        onPlaceSelected({ address, city, state, lat, lng });
      });
    };

    if (window.google?.maps?.places) {
      initAutocomplete();
    } else {
      // Load script if not loaded
      if (!document.getElementById('google-maps-script')) {
        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;
        window.initGoogleMaps = initAutocomplete;
        document.head.appendChild(script);
      } else {
        window.initGoogleMaps = initAutocomplete;
      }
    }

    return () => {
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
