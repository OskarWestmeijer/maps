package westmeijer.oskar.maps.repository

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface SubwayStationRepository : JpaRepository<SubwayStation, Long> {

    @Query(
        value = """
            SELECT 
                gid,
                name,
                ST_Transform(geom, :target_projection) AS geom
            FROM public.nyc_subway_stations
            ORDER BY gid ASC""",
        nativeQuery = true
    )
    fun findAll(@Param("target_projection") targetProjection: Int): List<SubwayStation>

}