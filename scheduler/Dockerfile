FROM eclipse-temurin:21.0.2_13-jre-alpine

COPY build/libs/flights-scheduler.jar /flights-scheduler.jar

ENV JAVA_OPTS="-Xms60m -Xmx60m"

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar /flights-scheduler.jar"]