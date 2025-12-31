package westmeijer.oskar.maps.controller

import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.PostMapping

@Controller
class RoutingController {

    private val log = LoggerFactory.getLogger(RoutingController::class.java)

    @PostMapping("/routing")
    fun computeRoute(): ResponseEntity<String> {
        log.info("routing controller requested")
        return ResponseEntity.ok("Routing controller compute")
    }

}