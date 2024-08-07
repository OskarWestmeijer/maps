package westmeijer.oskar.models.server

import kotlinx.serialization.Serializable

@Serializable
data class FlightRoute(
    val hamAirport: Airport,
    val connectionAirport: Airport,
    val flightCount: Int,
    val importedAt: String
)
