pluginManagement {
    val useGoogleCentralMirror =
        providers.gradleProperty("shipUseGoogleCentralMirror")
            .map(String::toBoolean)
            .orElse(false)
            .get()

    repositories {
        google()
        if (useGoogleCentralMirror) {
            maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2") }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    val useGoogleCentralMirror =
        providers.gradleProperty("shipUseGoogleCentralMirror")
            .map(String::toBoolean)
            .orElse(false)
            .get()

    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        if (useGoogleCentralMirror) {
            maven { url = uri("https://maven-central.storage-download.googleapis.com/maven2") }
        }
        mavenCentral()
    }
}

rootProject.name = "ShipOfTheseus"
include(":app")
