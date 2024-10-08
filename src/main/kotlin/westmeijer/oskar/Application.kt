package westmeijer.oskar

import SchedulerListener
import configureServerSerialization
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.cors.routing.*
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import westmeijer.oskar.redis.Cache
import westmeijer.oskar.routes.registerAirports
import westmeijer.oskar.routes.registerConnections
import westmeijer.oskar.routes.registerOpenapi
import westmeijer.oskar.services.AirportService
import westmeijer.oskar.services.ConnectionsService

fun main(args: Array<String>): Unit = io.ktor.server.netty.EngineMain.main(args)

fun Application.module() {

    Secrets.apiKey = environment.config.property("api.key").getString()
    Secrets.baseUrl = environment.config.property("api.url").getString()
    Secrets.redisUrl = environment.config.property("redis.url").getString()

    configureServerSerialization()

    install(CORS) {
        allowHost("*")
        allowHeader(HttpHeaders.ContentType)
    }

    // register api endpoints
    registerConnections()
    registerAirports()
    registerOpenapi()

    // init airport csv
    AirportService.getAirport("HEL")

    // init redis cache
    Cache

    val scope = CoroutineScope(Dispatchers.Default + CoroutineName("FlightsApiMainCoroutine"))
    scope.launch {
        try {
            ConnectionsService.refreshConnections()
        } catch (e: Exception) {
            log.error("Error initializing flight routes. Cache init depending on scheduled refresh.", e)
        }
    }

    // start listening for scheduler
    SchedulerListener.startListening(scope)
}
