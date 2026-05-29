package com.nocode.service;

import lombok.Getter;

/**
 * Maps our internal language IDs to Docker images and execution config.
 * IDs are kept compatible with Judge0 CE for future migration ease.
 */
@Getter
public enum Language {

    PYTHON3   (71, "python:3.11-slim",          "solution.py",  null,                              "python3 solution.py"),
    JAVA      (62, "eclipse-temurin:21-jdk-alpine", "Main.java",    "javac Main.java",                 "java Main"),
    CPP       (54, "gcc:13",                    "solution.cpp", "g++ -O2 -o solution solution.cpp","./solution"),
    JAVASCRIPT(63, "node:20-slim",              "solution.js",  null,                              "node solution.js"),
    C         (50, "gcc:13",                    "solution.c",   "gcc -O2 -o solution solution.c",  "./solution"),
    RUST      (73, "rust:1.75-slim",            "solution.rs",  "rustc -o solution solution.rs",   "./solution"),
    KOTLIN    (78, "eclipse-temurin:21-jdk-alpine", "solution.kt",  "kotlinc solution.kt -include-runtime -d solution.jar", "java -jar solution.jar");

    private final int id;
    private final String dockerImage;
    private final String fileName;
    private final String compileCmd;   // null = interpreted, no compile step
    private final String runCmd;

    Language(int id, String dockerImage, String fileName, String compileCmd, String runCmd) {
        this.id = id;
        this.dockerImage = dockerImage;
        this.fileName = fileName;
        this.compileCmd = compileCmd;
        this.runCmd = runCmd;
    }

    public static Language fromId(int id) {
        for (Language lang : values()) {
            if (lang.id == id) return lang;
        }
        throw new IllegalArgumentException("Unsupported language ID: " + id);
    }

    public boolean isCompiled() {
        return compileCmd != null;
    }
}