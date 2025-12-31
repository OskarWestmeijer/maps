package westmeijer.oskar.maps.repository

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface SubwayStationRepository : JpaRepository<SubwayStation, Long>