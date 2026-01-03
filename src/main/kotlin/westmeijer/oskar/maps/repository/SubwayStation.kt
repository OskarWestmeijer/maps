package westmeijer.oskar.maps.repository

import jakarta.persistence.*
import org.locationtech.jts.geom.Point

@Entity
@Table(name = "nyc_subway_stations")
data class SubwayStation(

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val gid: Long = 0,

    val name: String? = null,

    /**
     * Stored in Spatial Reference Identifier "26918". It uses meters as units (not latitude/longitude).
     */
    @Column(columnDefinition = "geometry(Point, 26918)")
    val geom: Point? = null

)