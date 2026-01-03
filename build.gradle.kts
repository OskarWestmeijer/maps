import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
	kotlin("jvm") version "2.3.0"
	kotlin("plugin.spring") version "2.2.21"
	id("org.springframework.boot") version "4.0.1"
	id("io.spring.dependency-management") version "1.1.7"
	application
}

group = "westmeijer.oskar"
version = "0.0.1-SNAPSHOT"
description = "Maps routing"

repositories {
	mavenCentral()
}

kotlin {
	jvmToolchain(24)
}

dependencies {
	// Spring Boot starters
	implementation("org.springframework.boot:spring-boot-starter")
	implementation("org.springframework.boot:spring-boot-starter-web")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")

	// Kotlin
	implementation("org.jetbrains.kotlin:kotlin-reflect")

	// Database & Hibernate
	implementation("org.postgresql:postgresql:42.7.7")
	implementation("org.hibernate.orm:hibernate-spatial:7.2.0.Final")

	// Test dependencies
	testImplementation("org.springframework.boot:spring-boot-starter-test")
	testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
	mainClass.set("westmeijer.oskar.maps.MapsApplicationKt")
}

tasks.test {
	useJUnitPlatform()
}
