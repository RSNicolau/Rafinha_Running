'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LivePosition {
  athleteId: string;
  latitude: number;
  longitude: number;
  pace: number;
  distance: number;
  heartRate?: number;
  elapsed: number;
  altitude?: number;
  cadence?: number;
  timestamp: number;
}

interface LiveAthleteInfo {
  athleteId: string;
  name?: string;
  lastUpdate: LivePosition | null;
  startedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPace(paceSeconds: number) {
  if (!paceSeconds || !isFinite(paceSeconds)) return '--:--';
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number) {
  if (!meters) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElapsed(secs: number) {
  if (!secs) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Mapbox token ─────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ─── Map Component ────────────────────────────────────────────────────────────

interface MapboxMapProps {
  positions: Map<string, LivePosition>;
  athletes: LiveAthleteInfo[];
  selectedAthleteId: string | null;
}

function MapboxMap({ positions, athletes, selectedAthleteId }: MapboxMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // Use unknown so we don't need @types/mapbox-gl at import time
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setMapError('Configure NEXT_PUBLIC_MAPBOX_TOKEN para ver o mapa');
      return;
    }
    if (!mapContainerRef.current || mapRef.current) return;

    let mapboxgl: any;
    try {
      // Dynamic require — works after npm install mapbox-gl
      mapboxgl = require('mapbox-gl');
      require('mapbox-gl/dist/mapbox-gl.css');
    } catch {
      setMapError('Instale o pacote mapbox-gl: npm install mapbox-gl @types/mapbox-gl');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-51.925, -14.235], // Brazil center [lng, lat]
      zoom: 4,
    });

    map.on('load', () => setMapReady(true));
    map.on('error', () => setMapError('Erro ao carregar mapa Mapbox'));

    mapRef.current = map;

    return () => {
      // Clean up all markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers whenever positions change
  useEffect(() => {
    if (!mapReady || !mapRef.current || !MAPBOX_TOKEN) return;

    let mapboxgl: any;
    try {
      mapboxgl = require('mapbox-gl');
    } catch {
      return;
    }

    const activeIds = new Set<string>();

    positions.forEach((pos, athleteId) => {
      if (!pos.latitude || !pos.longitude) return;
      activeIds.add(athleteId);

      const athleteInfo = athletes.find((a) => a.athleteId === athleteId);
      const displayName = athleteInfo?.name ?? `Atleta ${athleteId.slice(0, 6)}`;
      const lngLat: [number, number] = [pos.longitude, pos.latitude];

      if (markersRef.current.has(athleteId)) {
        // Update existing marker position
        markersRef.current.get(athleteId).setLngLat(lngLat);
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.style.cssText = [
          'width:32px',
          'height:32px',
          'border-radius:50%',
          'background:#DC2626',
          'border:3px solid white',
          'box-shadow:0 2px 8px rgba(220,38,38,0.5)',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'cursor:pointer',
          'font-size:11px',
          'font-weight:700',
          'color:white',
          'font-family:system-ui,sans-serif',
        ].join(';');
        el.textContent = displayName.charAt(0).toUpperCase();

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;padding:4px 2px;min-width:140px">
            <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#111">${displayName}</p>
            <p style="font-size:11px;color:#6b7280;margin:2px 0">
              <span style="font-weight:600;color:#DC2626">${formatPace(pos.pace)}</span> /km
            </p>
            <p style="font-size:11px;color:#6b7280;margin:2px 0">
              ${formatDistance(pos.distance)}
            </p>
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
          .setHTML(popupHtml);

        const marker = new mapboxgl.Marker(el)
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(mapRef.current);

        el.addEventListener('mouseenter', () => popup.addTo(mapRef.current));
        el.addEventListener('mouseleave', () => popup.remove());

        markersRef.current.set(athleteId, marker);
      }
    });

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Pan to show all active athletes
    if (activeIds.size > 0 && mapRef.current) {
      const coords = Array.from(activeIds)
        .map((id) => positions.get(id))
        .filter((p): p is LivePosition => !!p && !!p.latitude && !!p.longitude);

      if (coords.length === 1) {
        mapRef.current.flyTo({ center: [coords[0].longitude, coords[0].latitude], zoom: 14, duration: 1200 });
      } else if (coords.length > 1) {
        try {
          const bounds = coords.reduce(
            (acc, p) => acc.extend([p.longitude, p.latitude]),
            new mapboxgl.LngLatBounds(
              [coords[0].longitude, coords[0].latitude],
              [coords[0].longitude, coords[0].latitude],
            ),
          );
          mapRef.current.fitBounds(bounds, { padding: 80, duration: 1200 });
        } catch {
          // ignore bounds errors
        }
      }
    }
  }, [positions, athletes, mapReady]);

  // Pan to selected athlete
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedAthleteId) return;
    const pos = positions.get(selectedAthleteId);
    if (pos?.latitude && pos?.longitude) {
      mapRef.current.flyTo({ center: [pos.longitude, pos.latitude], zoom: 15, duration: 1000 });
    }
  }, [selectedAthleteId, positions, mapReady]);

  if (mapError) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50/30 p-8 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <p className="text-sm text-gray-500 font-medium">{mapError}</p>
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-full w-full" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveTrackingPage() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveAthletes, setLiveAthletes] = useState<LiveAthleteInfo[]>([]);
  const [watchedPositions, setWatchedPositions] = useState<Map<string, LivePosition>>(new Map());
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io('/live', {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('athlete-update', (data: LivePosition) => {
      setWatchedPositions((prev) => {
        const next = new Map(prev);
        next.set(data.athleteId, data);
        return next;
      });
    });

    socket.on('athlete-started', (data: { athleteId: string }) => {
      setLiveAthletes((prev) => {
        if (prev.find((a) => a.athleteId === data.athleteId)) return prev;
        return [...prev, { athleteId: data.athleteId, lastUpdate: null, startedAt: Date.now() }];
      });
    });

    socket.on('athlete-stopped', (data: { athleteId: string }) => {
      setLiveAthletes((prev) => prev.filter((a) => a.athleteId !== data.athleteId));
      setWatchedPositions((prev) => {
        const next = new Map(prev);
        next.delete(data.athleteId);
        return next;
      });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const refreshLiveAthletes = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('get-live-athletes', {}, (data: LiveAthleteInfo[]) => {
      setLiveAthletes(data || []);
    });
  }, []);

  useEffect(() => {
    if (isConnected) {
      refreshLiveAthletes();
      const interval = setInterval(refreshLiveAthletes, 10000);
      return () => clearInterval(interval);
    }
  }, [isConnected, refreshLiveAthletes]);

  const handleWatch = (athleteId: string) => {
    if (!socketRef.current) return;
    if (selectedAthleteId === athleteId) {
      socketRef.current.emit('unwatch-athlete', { athleteId });
      setSelectedAthleteId(null);
    } else {
      if (selectedAthleteId) {
        socketRef.current.emit('unwatch-athlete', { athleteId: selectedAthleteId });
      }
      socketRef.current.emit('watch-athlete', { athleteId });
      setSelectedAthleteId(athleteId);
    }
  };

  const selectedPosition = selectedAthleteId ? watchedPositions.get(selectedAthleteId) : null;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Live Tracking</h1>
          <p className="text-sm text-gray-500 mt-1">Acompanhe seus atletas em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 border border-gray-200/60 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isConnected ? 'Conectado' : 'Desconectado'}
          </div>
          <button
            onClick={refreshLiveAthletes}
            className="p-2 rounded-lg bg-white/80 border border-gray-200/60 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + map */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Athletes Sidebar — fixed width */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Live athletes list */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Atletas ao vivo</h3>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {liveAthletes.length}
              </span>
            </div>

            {liveAthletes.length === 0 ? (
              <div className="py-12 text-center">
                <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <p className="text-sm text-gray-400">Nenhum atleta online</p>
              </div>
            ) : (
              <div className="space-y-2">
                {liveAthletes.map((athlete) => {
                  const pos = watchedPositions.get(athlete.athleteId);
                  const isSelected = selectedAthleteId === athlete.athleteId;
                  const displayName = athlete.name ?? `Atleta ${athlete.athleteId.slice(0, 6)}`;

                  return (
                    <button
                      key={athlete.athleteId}
                      onClick={() => handleWatch(athlete.athleteId)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-gray-100 bg-white/60 hover:bg-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                          {pos ? (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatDistance(pos.distance)} · {formatPace(pos.pace)} /km
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-0.5">Iniciando...</p>
                          )}
                        </div>
                        <svg
                          className={`w-5 h-5 shrink-0 ${isSelected ? 'text-primary' : 'text-gray-300'}`}
                          fill={isSelected ? 'currentColor' : 'none'}
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={isSelected ? 0 : 1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Resumo</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Online agora</span>
                <span className="text-sm font-semibold text-gray-900">{liveAthletes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Servidor</span>
                <span className={`text-sm font-semibold ${isConnected ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Mapa</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  MAPBOX_TOKEN
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}>
                  {MAPBOX_TOKEN ? 'Ativo' : 'Sem token'}
                </span>
              </div>
            </div>
          </div>

          {/* Selected athlete stats */}
          {selectedPosition && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Em destaque</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Pace', value: formatPace(selectedPosition.pace), sub: '/km' },
                  { label: 'Distância', value: formatDistance(selectedPosition.distance), sub: '' },
                  { label: 'FC', value: selectedPosition.heartRate ? `${selectedPosition.heartRate}` : '--', sub: 'bpm' },
                  { label: 'Tempo', value: formatElapsed(selectedPosition.elapsed), sub: '' },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className="text-base font-bold text-gray-900">{s.value}</p>
                    {s.sub && <p className="text-[10px] text-gray-400">{s.sub}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map — takes remaining space */}
        <div className="flex-1 min-w-0 glass-card overflow-hidden relative">
          {liveAthletes.length === 0 && !MAPBOX_TOKEN ? (
            <div className="h-full flex flex-col items-center justify-center bg-gray-50/30 text-center p-8">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-300 border-2 border-white" />
              </div>
              <p className="text-gray-900 font-medium text-lg mb-1">Nenhum atleta correndo agora</p>
              <p className="text-gray-400 text-sm max-w-xs">
                Quando um atleta iniciar um treino com GPS, ele aparecerá aqui no mapa em tempo real.
              </p>
            </div>
          ) : (
            <MapboxMap
              positions={watchedPositions}
              athletes={liveAthletes}
              selectedAthleteId={selectedAthleteId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
