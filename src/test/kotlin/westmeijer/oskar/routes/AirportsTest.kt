package westmeijer.oskar.routes

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.test.runTest
import org.skyscreamer.jsonassert.JSONAssert
import kotlin.test.Test
import kotlin.test.assertEquals

class AirportsTest {

    @Test
    fun testUnmappedAirports() = testApplication {
        runTest {

            val actual = client.get("/airports") {
                url {
                    parameters.append("unmapped", "")
                }
            }

            val expected = """
            {
                "unmapped" : []
            }
        """.trimIndent()

            assertEquals(HttpStatusCode.OK, actual.status)
            JSONAssert.assertEquals(expected, actual.bodyAsText(), true)
        }
    }

    @Test
    fun testAirports() = testApplication {
        runTest {

            val actual = client.get("/airports")

            val expected = """
                Not yet implemented. Request with query param 'unmapped'.
        """.trimIndent()

            assertEquals(HttpStatusCode.OK, actual.status)
            assertEquals(expected, actual.bodyAsText())
        }
    }


}