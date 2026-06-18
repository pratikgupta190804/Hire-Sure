FROM eclipse-temurin:21-jdk-alpine

WORKDIR /runner

# Copy and compile the dispatcher
COPY WarmJvmRunner.java .
RUN javac -J-Xms8m -J-Xmx32m WarmJvmRunner.java

# Generate Class Data Sharing archive so JVM boots in ~150ms instead of ~800ms
RUN java -Xshare:dump 2>/dev/null || true
RUN java -XX:ArchiveClassesAtExit=/runner/runner.jsa \
         -cp /runner WarmJvmRunner < /dev/null 2>/dev/null || true

WORKDIR /workspace

# Dispatcher entrypoint: persistent, never exits
ENTRYPOINT ["java", \
  "-Xshare:on", \
  "-XX:SharedArchiveFile=/runner/runner.jsa", \
  "-Xms32m", "-Xmx256m", \
  "-XX:TieredStopAtLevel=1", \
  "-cp", "/runner:/workspace", \
  "WarmJvmRunner"]