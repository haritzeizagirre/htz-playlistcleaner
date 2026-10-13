const { withGradleProperties } = require('expo/config-plugins');

/**
 * Sube la memoria del daemon de Gradle.
 *
 * Los builds de release para 4 arquitecturas (arm64, armv7, x86, x86_64) con
 * todos los módulos nativos agotan el valor por defecto de la plantilla
 * (`-Xmx2048m -XX:MaxMetaspaceSize=512m`) y el daemon muere a mitad de build
 * ("Gradle build daemon has been stopped").
 *
 * Al ser un config plugin, el ajuste se aplica en cada `expo prebuild`, así
 * que sobrevive a la regeneración de `android/`.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const properties = cfg.modResults;
    const existing = properties.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'
    );

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      properties.push({
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: JVM_ARGS,
      });
    }

    return cfg;
  });
};
