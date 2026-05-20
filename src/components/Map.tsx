import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';

// Fix for default marker icon in Leaflet + React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored markers for clear separation of pickup and dropoff with modern Google-style circular pins
const pickupCustomIcon = L.divIcon({
  html: `<div class="w-6 h-6 bg-emerald-500 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center transition-all transform hover:scale-110">
    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
  </div>`,
  className: 'custom-map-marker-pickup',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const dropoffCustomIcon = L.divIcon({
  html: `<div class="w-6 h-6 bg-rose-500 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center transition-all transform hover:scale-110">
    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
  </div>`,
  className: 'custom-map-marker-dropoff',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const customBubbleIcon = (text: string) => {
  return L.divIcon({
    html: `
      <div style="position: relative; transform: translate(-50%, -100%); margin-top: -8px; pointer-events: none;">
        <div class="bg-blue-600 border-2 border-white text-white font-extrabold px-3 py-1 rounded-lg text-[11px] flex items-center justify-center shadow-lg whitespace-nowrap tracking-wide leading-none" style="box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
          ${text}
        </div>
        <div class="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-blue-600"></div>
      </div>
    `,
    className: 'custom-route-bubble',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
};

interface MapProps {
  pickup?: { lat: number; lng: number } | null;
  dropoff?: { lat: number; lng: number } | null;
  center?: [number, number];
  onPickupChange?: (coords: { lat: number; lng: number }) => void;
  onDropoffChange?: (coords: { lat: number; lng: number }) => void;
  onDistanceChange?: (distance: number) => void;
}

function MapController({
  tempPickup,
  tempDropoff,
  focusTrigger,
  defaultCenter
}: {
  tempPickup: { lat: number; lng: number } | null;
  tempDropoff: { lat: number; lng: number } | null;
  focusTrigger: { type: 'pickup' | 'dropoff'; time: number } | null;
  defaultCenter: [number, number];
}) {
  const map = useMap();
  const lastFocusRef = useRef<number>(0);
  const prevPickupRef = useRef<string>('');
  const prevDropoffRef = useRef<string>('');

  // Handle camera flight when clicking "Update Pickup" / "Update Drop"
  useEffect(() => {
    if (focusTrigger && focusTrigger.time !== lastFocusRef.current) {
      lastFocusRef.current = focusTrigger.time;
      if (focusTrigger.type === 'pickup' && tempPickup) {
        map.flyTo([tempPickup.lat, tempPickup.lng], 15, { animate: true, duration: 1.5 });
      } else if (focusTrigger.type === 'dropoff' && tempDropoff) {
        map.flyTo([tempDropoff.lat, tempDropoff.lng], 15, { animate: true, duration: 1.5 });
      }
    }
  }, [focusTrigger, tempPickup, tempDropoff, map]);

  // Handle fitting bounds seamlessly on coordinate changes
  useEffect(() => {
    const pickupKey = tempPickup ? `${tempPickup.lat},${tempPickup.lng}` : '';
    const dropoffKey = tempDropoff ? `${tempDropoff.lat},${tempDropoff.lng}` : '';

    if (pickupKey === prevPickupRef.current && dropoffKey === prevDropoffRef.current) {
      return;
    }

    prevPickupRef.current = pickupKey;
    prevDropoffRef.current = dropoffKey;

    if (tempPickup && tempDropoff) {
      const bounds = L.latLngBounds(
        [tempPickup.lat, tempPickup.lng],
        [tempDropoff.lat, tempDropoff.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (tempPickup) {
      map.setView([tempPickup.lat, tempPickup.lng], 14);
    } else if (tempDropoff) {
      map.setView([tempDropoff.lat, tempDropoff.lng], 14);
    } else {
      map.setView(defaultCenter, 5);
    }
  }, [tempPickup, tempDropoff, defaultCenter, map]);

  return null;
}

function MapClickHandler({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    }
  });
  return null;
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 400);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function Map({ pickup, dropoff, center = [20.5937, 78.9629], onPickupChange, onDropoffChange, onDistanceChange }: MapProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [isSatellite, setIsSatellite] = useState(true);
  const [durationText, setDurationText] = useState<string>('');
  const [activeSelection, setActiveSelection] = useState<'pickup' | 'dropoff'>('pickup');
  const [focusTrigger, setFocusTrigger] = useState<{ type: 'pickup' | 'dropoff'; time: number } | null>(null);

  // States for temporary editing selection
  const [tempPickup, setTempPickup] = useState<{ lat: number; lng: number } | null>(pickup || null);
  const [tempDropoff, setTempDropoff] = useState<{ lat: number; lng: number } | null>(dropoff || null);
  const [tempDistance, setTempDistance] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Sync state when props change externally and we are not in edit state
  useEffect(() => {
    if (!isEditing) {
      setTempPickup(pickup || null);
    }
  }, [pickup, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setTempDropoff(dropoff || null);
    }
  }, [dropoff, isEditing]);

  const onDistanceChangeRef = useRef(onDistanceChange);
  useEffect(() => {
    onDistanceChangeRef.current = onDistanceChange;
  }, [onDistanceChange]);

  const tempPickupLat = tempPickup?.lat;
  const tempPickupLng = tempPickup?.lng;
  const tempDropoffLat = tempDropoff?.lat;
  const tempDropoffLng = tempDropoff?.lng;

  // Real-time routing computation using temp coordinates
  useEffect(() => {
    if (tempPickupLat === undefined || tempPickupLng === undefined || tempDropoffLat === undefined || tempDropoffLng === undefined) {
      setRouteCoords([]);
      setDurationText('');
      setTempDistance(null);
      return;
    }

    let isMounted = true;

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${tempPickupLng},${tempPickupLat};${tempDropoffLng},${tempDropoffLat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("OSRM routing failed");
        const data = await response.json();
        
        if (isMounted && data.code === 'Ok' && data.routes?.[0]) {
          const route = data.routes[0];
          if (route.geometry?.coordinates) {
            const coords: [number, number][] = route.geometry.coordinates.map(
              (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
            );
            setRouteCoords(coords);
          }
          
          if (route.duration !== undefined) {
            const mins = Math.round(route.duration / 60);
            setDurationText(mins > 0 ? `${mins} min` : '1 min');
          } else if (route.distance !== undefined) {
            const distanceKm = route.distance / 1000;
            const mins = Math.round((distanceKm / 40) * 60);
            setDurationText(mins > 0 ? `${mins} min` : '1 min');
          }

          if (route.distance !== undefined) {
            const distanceKm = parseFloat((route.distance / 1000).toFixed(2));
            setTempDistance(distanceKm);
          }
        }
      } catch (err) {
        console.warn("OSRM routing failed, falling back to straight line:", err);
        if (isMounted) {
          setRouteCoords([]);
          // Straight line distance in km * 1.25 fallback
          const R = 6371;
          const dLat = (tempDropoffLat - tempPickupLat) * Math.PI / 180;
          const dLng = (tempDropoffLng - tempPickupLng) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(tempPickupLat * Math.PI / 180) * Math.cos(tempDropoffLat * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const straightLine = R * c;
          const distanceKm = parseFloat((straightLine * 1.25).toFixed(2));
          
          const mins = Math.round((distanceKm / 40) * 60);
          setDurationText(mins > 0 ? `${mins} min` : '5 min');
          setTempDistance(distanceKm);
        }
      }
    };

    fetchRoute();
    return () => {
      isMounted = false;
    };
  }, [tempPickupLat, tempPickupLng, tempDropoffLat, tempDropoffLng]);

  const mapCenter: [number, number] = tempPickup ? [tempPickup.lat, tempPickup.lng] : center;

  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);

  const pickupEventHandlers = {
    dragend() {
      const marker = pickupMarkerRef.current;
      if (marker != null) {
        const latLng = marker.getLatLng();
        setTempPickup({ lat: latLng.lat, lng: latLng.lng });
        setIsEditing(true);
      }
    },
  };

  const dropoffEventHandlers = {
    dragend() {
      const marker = dropoffMarkerRef.current;
      if (marker != null) {
        const latLng = marker.getLatLng();
        setTempDropoff({ lat: latLng.lat, lng: latLng.lng });
        setIsEditing(true);
      }
    },
  };

  const handleMapClick = (latlng: L.LatLng) => {
    if (activeSelection === 'pickup') {
      setTempPickup({ lat: latlng.lat, lng: latlng.lng });
      setIsEditing(true);
    } else if (activeSelection === 'dropoff') {
      setTempDropoff({ lat: latlng.lat, lng: latlng.lng });
      setIsEditing(true);
    }
  };

  const handleConfirmSelection = () => {
    if (tempPickup && onPickupChange) {
      onPickupChange(tempPickup);
    }
    if (tempDropoff && onDropoffChange) {
      onDropoffChange(tempDropoff);
    }
    if (tempDistance !== null && onDistanceChange) {
      onDistanceChange(tempDistance);
    }
    setIsEditing(false);
  };

  const handleCancelSelection = () => {
    setTempPickup(pickup || null);
    setTempDropoff(dropoff || null);
    setIsEditing(false);
  };

  const isInteractive = !!(onPickupChange || onDropoffChange);

  // Find midpoint of route to place the bubble info (as shown in user image)
  let bubblePosition: [number, number] | null = null;
  if (tempPickup && tempDropoff) {
    if (routeCoords.length > 0) {
      const middleIndex = Math.floor(routeCoords.length / 2);
      bubblePosition = routeCoords[middleIndex];
    } else {
      bubblePosition = [
        (tempPickup.lat + tempDropoff.lat) / 2,
        (tempPickup.lng + tempDropoff.lng) / 2
      ];
    }
  }

  return (
    <div className="h-[300px] w-full rounded-2xl overflow-hidden border border-zinc-200 shadow-inner relative z-0">
      {/* Hide the Leaflet attribution physically */}
      <style>{`
        .leaflet-control-attribution {
          display: none !important;
        }
      `}</style>
      {/* Mode Toggles (Satellite vs Street Map) */}
      <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-sm shadow-md rounded-xl p-1 flex items-center gap-1 z-[1000] border border-zinc-200">
        <button
          type="button"
          onClick={() => setIsSatellite(true)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
            isSatellite
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <span>🛰️ Satellite</span>
        </button>
        <button
          type="button"
          onClick={() => setIsSatellite(false)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
            !isSatellite
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <span>🗺️ Street</span>
        </button>
      </div>

      {/* Interactive Selection Toggles when user is editing map */}
      {isInteractive && (
        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm shadow-md rounded-xl p-1.5 flex items-center gap-1 z-[1000] border border-zinc-200">
          <button
            type="button"
            onClick={() => {
              setActiveSelection('pickup');
              if (tempPickup) {
                setFocusTrigger({ type: 'pickup', time: Date.now() });
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
              activeSelection === 'pickup'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span>🟢 Update Pickup</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSelection('dropoff');
              if (tempDropoff) {
                setFocusTrigger({ type: 'dropoff', time: Date.now() });
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
              activeSelection === 'dropoff'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span>🔴 Update Drop</span>
          </button>
        </div>
      )}

      {/* Floating Confirm & Cancel Selection banner to prevent immediate form updates until confirmed */}
      {isEditing && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5 w-[90%] sm:w-auto max-w-xs animate-in slide-in-from-bottom duration-300">
          <button
            type="button"
            onClick={handleConfirmSelection}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer border border-indigo-400 transition-all transform active:scale-95"
            style={{ boxShadow: '0 8px 24px rgba(79, 70, 229, 0.45)' }}
          >
            <span>✅ Confirm Route Updates</span>
            {tempDistance !== null && (
              <span className="bg-white/25 px-1.5 py-0.5 rounded text-[10px] font-black">{tempDistance} km</span>
            )}
          </button>
          <button
            type="button"
            onClick={handleCancelSelection}
            className="bg-zinc-950/90 hover:bg-zinc-950 text-zinc-300 font-extrabold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide cursor-pointer flex items-center gap-1 shadow-md border border-zinc-800"
          >
            <span>✕ Discard Changes</span>
          </button>
        </div>
      )}

      {isInteractive && !isEditing && (
        <div className="absolute bottom-2 left-2 bg-zinc-900/80 backdrop-blur-sm text-white px-3 py-1 rounded-lg text-[9px] font-bold tracking-widest uppercase z-[1000] pointer-events-none">
          💡 Click map or drag pins to position
        </div>
      )}

      <MapContainer 
        center={mapCenter} 
        zoom={pickup ? 13 : 5} 
        scrollWheelZoom={true} 
        doubleClickZoom={true}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        {isSatellite ? (
          <>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            {/* Transparent Street & Road Reference Overlay */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            />
            {/* Transparent Boundaries & Places Labels Reference Overlay */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            />
          </>
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        <MapController 
          tempPickup={tempPickup} 
          tempDropoff={tempDropoff} 
          focusTrigger={focusTrigger} 
          defaultCenter={center} 
        />
        <MapInvalidator />
        {isInteractive && <MapClickHandler onClick={handleMapClick} />}

        {tempPickup && (
          <Marker 
            position={[tempPickup.lat, tempPickup.lng]}
            icon={pickupCustomIcon}
            draggable={!!onPickupChange}
            eventHandlers={pickupEventHandlers}
            ref={pickupMarkerRef}
          >
            <Popup>
              <div className="text-xs font-bold font-sans text-zinc-800">
                🟢 Pickup Location
                <div className="text-[9px] text-zinc-500 font-normal mt-0.5">(Drag me to change)</div>
              </div>
            </Popup>
          </Marker>
        )}
        {tempDropoff && (
          <Marker 
            position={[tempDropoff.lat, tempDropoff.lng]}
            icon={dropoffCustomIcon}
            draggable={!!onDropoffChange}
            eventHandlers={dropoffEventHandlers}
            ref={dropoffMarkerRef}
          >
            <Popup>
              <div className="text-xs font-bold font-sans text-zinc-800">
                🔴 Dropoff Location
                <div className="text-[9px] text-zinc-500 font-normal mt-0.5">(Drag me to change)</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Dynamic callout bubble showing route duration right on the path, matching the uploaded image */}
        {bubblePosition && durationText && (
          <Marker
            position={bubblePosition}
            icon={customBubbleIcon(durationText)}
            interactive={false}
          />
        )}

        {/* Draw a real-time Polyline connecting the pickup and dropoff points */}
        {tempPickup && tempDropoff && (
          routeCoords.length > 0 ? (
            <>
              {/* Thick dark casing/shadow underneath (matching the user image style) */}
              <Polyline 
                positions={routeCoords} 
                color="#1e1b4b" 
                weight={11}
                opacity={0.35}
                lineCap="round"
                lineJoin="round"
              />
              {/* Main solid vibrant indigo-blue route line (matching the user image style) */}
              <Polyline 
                positions={routeCoords} 
                color="#2f3bf6" 
                weight={7}
                opacity={0.95}
                lineCap="round"
                lineJoin="round"
              />
              {/* Inner glow core highlight line */}
              <Polyline 
                positions={routeCoords} 
                color="#6366f1" 
                weight={3}
                opacity={1}
                lineCap="round"
                lineJoin="round"
              />
            </>
          ) : (
            <>
              {/* Fallback solid straight line connecting them directly so a direction line is ALWAYS shown cleanly */}
              <Polyline 
                positions={[
                  [tempPickup.lat, tempPickup.lng],
                  [tempDropoff.lat, tempDropoff.lng]
                ]} 
                color="#1e1b4b" 
                weight={10}
                opacity={0.35}
                lineCap="round"
                lineJoin="round"
              />
              <Polyline 
                positions={[
                  [tempPickup.lat, tempPickup.lng],
                  [tempDropoff.lat, tempDropoff.lng]
                ]} 
                color="#2f3bf6" 
                weight={6}
                opacity={0.95}
                lineCap="round"
                lineJoin="round"
              />
            </>
          )
        )}
      </MapContainer>
    </div>
  );
}
