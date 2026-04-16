'use client';

interface EventMapProps {
  address: string; // human-readable address to embed
  latitude?: number;
  longitude?: number;
  height?: string; // e.g. "200px"
  zoom?: number;
}

export default function EventMap({ address, latitude, longitude, height = '220px', zoom = 15 }: EventMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Build embed URL
  let embedUrl: string;
  if (apiKey) {
    // Use Maps Embed API with API key
    if (latitude && longitude) {
      embedUrl = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${latitude},${longitude}&zoom=${zoom}&maptype=roadmap`;
    } else {
      embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(address)}&zoom=${zoom}`;
    }
  } else {
    // Fallback: free embed (no API key) — works for address-based embeds
    embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&z=${zoom}`;
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height }}>
      <iframe
        title="Localização do evento"
        src={embedUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
