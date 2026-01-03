package westmeijer.oskar.maps.controller

import org.locationtech.jts.geom.util.GeometryTransformer
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import westmeijer.oskar.maps.repository.SubwayStationRepository

@CrossOrigin
@RestController
class RoutingController(
    private val repository: SubwayStationRepository
) {

    private val log = LoggerFactory.getLogger(RoutingController::class.java)

    /**
     * EPSG 4326 (i.e. WGS 84)
     */
    private val targetProjection = 4326


    @PostMapping("/routing")
    fun computeRoute(): ResponseEntity<String> {
        log.info("routing controller requested")
        return ResponseEntity.ok("Routing controller compute")
    }

    @GetMapping("/stations")
    fun getAllStations(): List<SubwayStationDTO> {
        return repository.findAll(targetProjection).map { station ->
            SubwayStationDTO(
                gid = station.gid,
                name = station.name,
                lon = station.geom?.x?.toString(),
                lat = station.geom?.y?.toString()
            )
        }
    }

}