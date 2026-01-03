<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	export const ssr = false; // disables SSR for this page

	onMount(async () => {
		const L = await import('leaflet');
		console.log('Leaflet loaded on client');

		const map = L.map('leafletmap').setView([40.73, -74.0], 13);
		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);

		// Fetch backend data
		const response = await fetch('http://localhost:8080/stations');
		const stations = await response.json();

		// Plot each station
		stations.forEach((station: { lat: string; lon: string; name: string }) => {
			const lat = parseFloat(station.lat);
			const lon = parseFloat(station.lon);

			L.marker([lat, lon], { title: station.name })
				.addTo(map)
				.bindPopup(`<b>${station.name}</b><br/>Lon: ${lon}<br/>Lat: ${lat}`);
		});
	});
</script>

<main>
	<div id="leafletmap"></div>
</main>

<style>
	main {
		justify-content: center;
		display: flex;
		align-items: flex-start;
		padding: 2rem;
	}

	#leafletmap {
		height: 600px;
		width: 800px;
	}
</style>
