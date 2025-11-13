import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const colorFromSpeed = (v) => {
  if (!Number.isFinite(v)) return '#888';
  if (v >= 45) return '#16a34a';   // green
  if (v >= 30) return '#f39c12';   // orange
  return '#e74c3c';                // red
};

export default function Map({ rows = [] }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]); // keep track to clean up

  const [lng, setLng] = useState(-84.53);
  const [lat, setLat] = useState(33.95);
  const [zoom, setZoom] = useState(11.5);

  // Initialize map when component mounts
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [lng, lat],
      zoom: zoom
    });
    mapRef.current = map;

    // Add navigation control (the +/- zoom buttons)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('move', () => {
      setLng(map.getCenter().lng.toFixed(4));
      setLat(map.getCenter().lat.toFixed(4));
      setZoom(map.getZoom().toFixed(2));
    });

    // Clean up on unmount
    //return () => map.remove();
  //}, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      // remove any remaining markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
    };
  }, []);


  /*

    map.on('load', () => {
      map.resize();
    });
    // If the tab was hidden when mounted, force a resize once visible
    setTimeout(() => map.resize(), 1000);
    const onWinResize = () => map.resize();
    window.addEventListener('resize', onWinResize);
    
    return () => {
      window.removeEventListener('resize', onWinResize);
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  */
  // add/update markers whenever rows change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // (optional) limit for performance if you pull many rows
    // const data = rows.slice(0, 2000);
    const data = rows;

    for (const r of data) {
      const lat = r.start_latitude;
      const lon = r.start_longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      // build a small colored circle element
      const el = document.createElement('div');
      el.className = 'dot-marker';
      el.style.background = colorFromSpeed(r.speed);

      const html = `
        <div style="font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
          <div style="font-weight:600">${r.road || 'Unknown road'}</div>
          <div>${r.direction || ''}</div>
          <hr style="margin:6px 0"/>
          <div><b>Speed:</b> ${Number(r.speed).toFixed(1)} mph</div>
          ${Number.isFinite(r.confidence) ? `<div><b>Conf:</b> ${r.confidence.toFixed(2)}</div>` : ''}
          ${r.tmc_code ? `<div><b>TMC:</b> ${r.tmc_code}</div>` : ''}
          ${r.measurement_tstamp ? `<div><b>Time:</b> ${new Date(r.measurement_tstamp).toLocaleString()}</div>` : ''}
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(new mapboxgl.Popup({ maxWidth: '280px' }).setHTML(html))
        .addTo(map);

      markersRef.current.push(marker);
    }

    // (optional) fit to markers
    if (markersRef.current.length) {
      const b = new mapboxgl.LngLatBounds();
      for (const m of markersRef.current) b.extend(m.getLngLat());
      map.fitBounds(b, { padding: 40, maxZoom: 14 });
    }
  }, [rows]);
  
  return (
    <div className="map-root">
      <div className="sidebarStyle">
        Longitude: {lng} | Latitude: {lat} | Zoom: {zoom}
      </div>
      <div className="map-container" ref={mapContainerRef} />
    </div>
  );
}