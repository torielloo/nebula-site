const T = {
  mobile_download_corrupt: {
    en: {
      title: "Mobile download error — corrupted files",
      meaning: "The hash of the files downloaded on the phone does not match the expected value — the installation is corrupted.",
      cause: "The app could not verify the game files — usually because of an incomplete installation, an incompatible Android version (below 8.0), or insufficient storage.",
      identification: "The loading screen stops at 12% or 46% and shows an invalid hash message.",
      solution: "1. Uninstall Nébula Mobile.\n2. Free at least 6 GB of storage.\n3. Restart the phone.\n4. Download it again from the official website using a stable Wi-Fi connection.\n5. If it persists, try another Wi-Fi network."
    },
    es: {
      title: "Error de descarga en móvil — archivos dañados",
      meaning: "El hash de los archivos descargados en el celular no coincide con el valor esperado: la instalación está dañada.",
      cause: "La app no pudo verificar los archivos del juego, normalmente por una instalación incompleta, una versión de Android incompatible (inferior a 8.0) o falta de almacenamiento.",
      identification: "La pantalla de carga se detiene en 12% o 46% y muestra un mensaje de hash inválido.",
      solution: "1. Desinstala Nébula Mobile.\n2. Libera al menos 6 GB de almacenamiento.\n3. Reinicia el celular.\n4. Descárgalo de nuevo desde el sitio oficial con una conexión Wi-Fi estable.\n5. Si continúa, prueba otra red Wi-Fi."
    }
  },
  mobile_login_failed: {
    en: {
      title: "Infinite login on mobile (keeps spinning)",
      meaning: "Mobile login is not being authenticated correctly by the server.",
      cause: "Expired session token, incorrect device date/time, or a Discord-linked account whose password was recently changed.",
      identification: "The app opens, then immediately returns to the login screen.",
      solution: "1. Make sure the phone date and time are set automatically.\n2. Update the app to the latest version.\n3. Log in through the browser to confirm the account is active.\n4. If browser login works, clear the app data and sign in again."
    },
    es: {
      title: "Inicio de sesión infinito en móvil (se queda cargando)",
      meaning: "El inicio de sesión móvil no está siendo autenticado correctamente por el servidor.",
      cause: "Token de sesión vencido, fecha/hora incorrecta en el dispositivo o una cuenta vinculada a Discord cuya contraseña cambió recientemente.",
      identification: "La app se abre, pero vuelve enseguida a la pantalla de inicio de sesión.",
      solution: "1. Verifica que la fecha y hora del celular estén en automático.\n2. Actualiza la app a la versión más reciente.\n3. Inicia sesión desde el navegador para confirmar que la cuenta está activa.\n4. Si funciona en el navegador, borra los datos de la app e inicia sesión de nuevo."
    }
  },
  mobile_connection_lost: {
    en: {
      title: "Disconnecting in the middle of a match on mobile",
      meaning: "The phone lost its connection to the Nébula servers.",
      cause: "Unstable 4G/5G connection, an active VPN, or servers under maintenance.",
      identification: "The game disconnects and reconnects repeatedly during the match.",
      solution: "1. Switch between Wi-Fi and mobile data to test.\n2. Disable VPN and Android data saver.\n3. Forget the Wi-Fi network and reconnect.\n4. Check server status on the home page.\n5. If it persists, open a ticket under Mobile."
    },
    es: {
      title: "Desconexiones durante la partida en celular",
      meaning: "El celular perdió la conexión con los servidores de Nébula.",
      cause: "Conexión 4G/5G inestable, VPN activa o servidores en mantenimiento.",
      identification: "El juego se desconecta y vuelve a conectarse repetidamente durante la partida.",
      solution: "1. Alterna entre Wi-Fi y datos móviles para probar.\n2. Desactiva la VPN y el ahorro de datos de Android.\n3. Olvida la red Wi-Fi y vuelve a conectarte.\n4. Revisa el estado de los servidores en la página principal.\n5. Si continúa, abre un ticket en la categoría Mobile."
    }
  },
  "invalid-build": {
    en: {
      title: "Invalid build / game folder not accepted",
      meaning: "The game cannot be installed or accepted because the selected folder is not the correct Fortnite version folder.",
      cause: "The selected folder does not contain the FortniteGame and Engine folders, or the game version is incomplete/corrupted.",
      identification: "The launcher does not accept the chosen folder, or the folder size does not match the expected version size.",
      solution: "1. Make sure you selected the folder that contains both FortniteGame and Engine.\n2. Open the game folder properties and check its total size in GB.\n3. If the size is wrong, download the build again and select the correct parent folder."
    },
    es: {
      title: "Build inválida / carpeta del juego no aceptada",
      meaning: "El juego no se instala o no es aceptado porque la carpeta seleccionada no corresponde a la versión correcta de Fortnite.",
      cause: "La carpeta seleccionada no contiene FortniteGame y Engine, o la versión del juego está incompleta o dañada.",
      identification: "El launcher no acepta la carpeta elegida o el tamaño de la carpeta no coincide con el esperado para esa versión.",
      solution: "1. Asegúrate de seleccionar la carpeta que contiene FortniteGame y Engine.\n2. Abre las propiedades de la carpeta del juego y revisa su tamaño total en GB.\n3. Si el tamaño no coincide, descarga la build otra vez y selecciona la carpeta principal correcta."
    }
  },
  login: {
    en: {
      title: "Nébula Email / Nébula Password or Epic Email / Epic Password not accepted",
      meaning: "If Nébula Email/Password or Epic Email/Password is requested, follow the steps below to resolve it.",
      cause: "Corrupted login cache in AppData, antivirus/firewall blocking the launcher, or a problem with the linked account.",
      identification: "The launcher asks for credentials again even after you already logged in.",
      solution: "1. Press Windows + R, type appdata, open Local and delete FortniteGame.\n2. Log out and back into the launcher.\n3. Temporarily disable the antivirus for testing.\n4. Temporarily disable the firewall for testing.\n5. Try logging in with another Discord account."
    },
    es: {
      title: "Nébula Email / Nébula Password o Epic Email / Epic Password no aceptados",
      meaning: "Si se solicitan Nébula Email/Password o Epic Email/Password, sigue los pasos siguientes.",
      cause: "Caché de inicio de sesión dañada en AppData, antivirus/firewall bloqueando el launcher o problema con la cuenta vinculada.",
      identification: "El launcher vuelve a pedir las credenciales aunque ya hayas iniciado sesión.",
      solution: "1. Pulsa Windows + R, escribe appdata, entra en Local y elimina FortniteGame.\n2. Cierra sesión y vuelve a iniciar sesión en el launcher.\n3. Desactiva temporalmente el antivirus para probar.\n4. Desactiva temporalmente el firewall para probar.\n5. Prueba iniciar sesión con otra cuenta de Discord."
    }
  },
  dlss: {
    en: {
      title: "Graphics settings locked with no option to disable DLSS",
      meaning: "If the game settings are locked and there is no option to turn off DLSS, follow the steps below.",
      cause: "A game configuration file is stuck with DLSS enabled and the menu does not offer a disable option.",
      identification: "The in-game settings show DLSS enabled with no button or switch to disable it.",
      solution: "1. Press Windows + R, type appdata, open Local and delete FortniteGame.\n2. Launch the game again; DLSS should now be disabled."
    },
    es: {
      title: "Configuración bloqueada sin opción para desactivar DLSS",
      meaning: "Si la configuración del juego está bloqueada y no aparece la opción para desactivar DLSS, sigue estos pasos.",
      cause: "Un archivo de configuración quedó guardado con DLSS activado y el menú no ofrece la opción de desactivarlo.",
      identification: "El menú de gráficos muestra DLSS activado pero no aparece ningún botón o interruptor para desactivarlo.",
      solution: "1. Pulsa Windows + R, escribe appdata, entra en Local y elimina FortniteGame.\n2. Abre el juego de nuevo; DLSS debería quedar desactivado."
    }
  },
  launch: {
    en: {
      title: "Content download or verification failure (verification failed)",
      meaning: "If content download fails or verification fails, use the steps below.",
      cause: "Missing or corrupted .pak files in the game's Paks folder.",
      identification: "The launcher shows a verification failure or the content download never completes.",
      solution: "1. Download http://cdn.nebulafn.com/paks.rar\n2. Extract the files directly to <game folder>/FortniteGame/Content/Paks.\n3. Start the game again.\n4. Do not place the .rar itself inside Paks and do not create an extra folder."
    },
    es: {
      title: "Fallo al descargar contenido o verificar archivos (verification failed)",
      meaning: "Si falla la descarga de contenido o la verificación, sigue los pasos siguientes.",
      cause: "Archivos .pak faltantes o dañados dentro de la carpeta Paks del juego.",
      identification: "El launcher muestra un error de verificación o la descarga de contenido nunca termina.",
      solution: "1. Descarga http://cdn.nebulafn.com/paks.rar\n2. Extrae los archivos directamente en <carpeta del juego>/FortniteGame/Content/Paks.\n3. Inicia el juego de nuevo.\n4. No pongas el .rar dentro de Paks y no crees una carpeta adicional."
    }
  },
  "falha-ao-iniciar": {
    en: {
      title: "Tundra AntiCheat failed to start (error 4551 — Application Control policy)",
      meaning: "The game closes at startup because Windows Smart App Control blocks Tundra AntiCheat.",
      cause: "Windows Smart App Control policy is blocking the anticheat executable (error 4551).",
      identification: "A Launch failed popup says TundraAnticheat.exe was blocked by an Application Control policy (OS error 4551).",
      solution: "1. Open Windows Security.\n2. Open App & browser control.\n3. Open Smart App Control.\n4. Open its settings.\n5. Set it to Off."
    },
    es: {
      title: "Tundra AntiCheat no inicia (error 4551 — política de Control de aplicaciones)",
      meaning: "El juego se cierra al iniciar porque Smart App Control de Windows bloquea Tundra AntiCheat.",
      cause: "La política de Smart App Control de Windows está bloqueando el ejecutable del anticheat (error 4551).",
      identification: "Aparece Launch failed indicando que TundraAnticheat.exe fue bloqueado por una política de Control de aplicaciones (error 4551).",
      solution: "1. Abre Seguridad de Windows.\n2. Entra en Control de aplicaciones y navegador.\n3. Abre Smart App Control.\n4. Entra en su configuración.\n5. Márcalo como Desactivado."
    }
  },
  menu: {
    en: {
      title: "How to open the Nébula Menu in-game (Insert / FN+1 and 2)",
      meaning: "The Nébula Menu lets you configure in-game options such as Disable Pre Edit, Reset On Release, and FOV.",
      cause: "Not an error — this is a usage guide for the Nébula in-game menu.",
      identification: "You do not know how to open the in-game menu, or you use a 60% keyboard without a dedicated Insert key.",
      solution: "1. Press Insert to open the Nébula Menu.\n2. On 60% keyboards, use the on-screen keyboard or FN+1 and 2."
    },
    es: {
      title: "Cómo abrir el menú de Nébula en el juego (Insert / FN+1 y 2)",
      meaning: "El menú de Nébula permite configurar opciones del juego como Disable Pre Edit, Reset On Release y FOV.",
      cause: "No es un error: es una guía de uso del menú de Nébula dentro del juego.",
      identification: "No sabes cómo abrir el menú del juego o usas un teclado 60% sin tecla Insert dedicada.",
      solution: "1. Pulsa Insert para abrir el menú de Nébula.\n2. En teclados 60%, usa el teclado en pantalla o FN+1 y 2."
    }
  },
  crash: {
    en: {
      title: "Application Crash Detected when starting the game",
      meaning: "If the game fails to start with Application Crash Detected, try the solutions below.",
      cause: "Corrupted cache in %appdata% or outdated graphics drivers.",
      identification: "A popup says Application Crash Detected — The application has crashed and will now close.",
      solution: "1. Press Win + R, type %appdata%, delete FortniteGame, then start the game again.\n2. Update or install the latest graphics drivers.\n3. If it persists, check the minimum hardware requirements for version 14.40."
    },
    es: {
      title: "Application Crash Detected al iniciar el juego",
      meaning: "Si el juego no inicia y aparece Application Crash Detected, prueba las soluciones siguientes.",
      cause: "Caché dañada en %appdata% o drivers de video desactualizados.",
      identification: "Aparece un popup Application Crash Detected con el mensaje The application has crashed and will now close.",
      solution: "1. Pulsa Win + R, escribe %appdata%, elimina FortniteGame y abre el juego de nuevo.\n2. Actualiza o instala los drivers de la tarjeta gráfica.\n3. Si continúa, revisa los requisitos mínimos de hardware para la versión 14.40."
    }
  },
  OPERATION_ALREADY_RUNNING: {
    en: {
      title: "Error 04 — operation_already_running",
      meaning: "A previous game or launcher process is still open and prevents a new launch.",
      cause: "Fortnite, Nébula, or the launcher may still be running in the background.",
      identification: "The error appears and related processes are still visible in Task Manager.",
      solution: "1. Open Task Manager.\n2. End Fortnite, Nébula, and FortniteLauncher related processes.\n3. If it continues, restart the computer.\n4. Open Nébula again."
    },
    es: {
      title: "Error 04 — operation_already_running",
      meaning: "Un proceso anterior del juego o launcher sigue abierto e impide una nueva ejecución.",
      cause: "Fortnite, Nébula o el launcher pueden seguir ejecutándose en segundo plano.",
      identification: "El error aparece y todavía hay procesos relacionados visibles en el Administrador de tareas.",
      solution: "1. Abre el Administrador de tareas.\n2. Finaliza procesos relacionados con Fortnite, Nébula y FortniteLauncher.\n3. Si continúa, reinicia el equipo.\n4. Abre Nébula de nuevo."
    }
  },
  TIMEOUT: {
    en: {
      title: "Error 05 — No connection / Timeout",
      meaning: "The connection took too long to respond and expired.",
      cause: "VPN, proxy, ExitLag/NoPing, firewall, antivirus, or an unstable internet connection.",
      identification: "A timeout or no-connection message appears when trying to connect.",
      solution: "1. Check your internet connection.\n2. Disable VPN and proxy for testing.\n3. Test without ping reducers.\n4. Check firewall and antivirus.\n5. Restart the modem/router.\n6. Reopen the launcher as Administrator."
    },
    es: {
      title: "Error 05 — Sin conexión / Timeout",
      meaning: "La conexión tardó demasiado en responder y expiró.",
      cause: "VPN, proxy, ExitLag/NoPing, firewall, antivirus o una conexión inestable.",
      identification: "Aparece timeout o sin conexión al intentar entrar.",
      solution: "1. Revisa la conexión a internet.\n2. Desactiva VPN y proxy para probar.\n3. Prueba sin reductores de ping.\n4. Revisa firewall y antivirus.\n5. Reinicia el módem/router.\n6. Abre el launcher de nuevo como Administrador."
    }
  },
  FAILED_TO_FETCH: {
    en: {
      title: "Error 06 — Failed to fetch",
      meaning: "Nébula tried to fetch a file or information from the internet and could not complete the request.",
      cause: "VPN, network blockers, DNS, firewall, or antivirus interfering with the connection.",
      identification: "FAILED TO FETCH appears during loading.",
      solution: "1. Disable VPN and network ad blockers.\n2. Allow Nébula through Firewall and Antivirus.\n3. Change DNS to 8.8.8.8 / 8.8.4.4.\n4. Run ipconfig /flushdns in an Administrator CMD.\n5. Restart Nébula."
    },
    es: {
      title: "Error 06 — Failed to fetch",
      meaning: "Nébula intentó obtener un archivo o información por internet y no pudo completar la solicitud.",
      cause: "VPN, bloqueadores de red, DNS, firewall o antivirus interfiriendo con la conexión.",
      identification: "Aparece FAILED TO FETCH durante la carga.",
      solution: "1. Desactiva VPN y bloqueadores de red.\n2. Permite Nébula en el firewall y antivirus.\n3. Cambia el DNS a 8.8.8.8 / 8.8.4.4.\n4. Ejecuta ipconfig /flushdns en CMD como Administrador.\n5. Reinicia Nébula."
    }
  },
  MANIFEST_FETCH_FAILED: {
    en: {
      title: "Error 07 — MANIFEST_FETCH_FAILED",
      meaning: "Nébula could not download the information required to continue (manifest.json and .pak files).",
      cause: "ExitLag, NoPing, VPN, or DNS may be interfering with the connection.",
      identification: "The launcher shows MANIFEST_FETCH_FAILED / error sending request.",
      solution: "1. Disable VPNs/optimizers such as ExitLag, NoPing, or ProtonVPN.\n2. Change DNS to 8.8.8.8 / 8.8.4.4.\n3. Run ipconfig /flushdns in Administrator CMD.\n4. Open Nébula again as Administrator."
    },
    es: {
      title: "Error 07 — MANIFEST_FETCH_FAILED",
      meaning: "Nébula no pudo descargar la información necesaria para continuar (manifest.json y archivos .pak).",
      cause: "ExitLag, NoPing, VPN o DNS pueden estar interfiriendo con la conexión.",
      identification: "El launcher muestra MANIFEST_FETCH_FAILED / error sending request.",
      solution: "1. Desactiva VPN/optimizadores como ExitLag, NoPing o ProtonVPN.\n2. Cambia el DNS a 8.8.8.8 / 8.8.4.4.\n3. Ejecuta ipconfig /flushdns en CMD como Administrador.\n4. Abre Nébula de nuevo como Administrador."
    }
  },
  SECURITY_MONITOR_STOPPED: {
    en: {
      title: "Security monitor stopped responding",
      meaning: "The anticheat unexpectedly stopped in the background while you were playing.",
      cause: "Conflict with overlays, screen recorders, macros, antivirus, or missing Administrator permissions.",
      identification: "The game closes by itself and a security monitor warning appears.",
      solution: "1. Close recording/overlay/macro apps such as Medal.tv, RTSS, MSI Afterburner, OBS, Overwolf, GeForce Experience, AMD Adrenalin, and Discord overlay.\n2. Add the game and Nébula folders to antivirus exclusions.\n3. Always run the launcher as Administrator."
    },
    es: {
      title: "El monitor de seguridad dejó de responder",
      meaning: "El anticheat se cerró inesperadamente en segundo plano mientras jugabas.",
      cause: "Conflicto con overlays, grabadores de pantalla, macros, antivirus o falta de permisos de Administrador.",
      identification: "El juego se cierra solo y aparece un aviso del monitor de seguridad.",
      solution: "1. Cierra programas de grabación/overlay/macro como Medal.tv, RTSS, MSI Afterburner, OBS, Overwolf, GeForce Experience, AMD Adrenalin y el overlay de Discord.\n2. Añade las carpetas del juego y Nébula a las exclusiones del antivirus.\n3. Ejecuta siempre el launcher como Administrador."
    }
  },
  CONNECTION_FAILED: {
    en: {
      title: "Error 08 — Connection Failed",
      meaning: "Nébula could not complete the connection with the linked account.",
      cause: "Wrong Discord account, the account is not in the official server, or the linking process did not finish correctly.",
      identification: "CONNECTION FAILED appears after login or account linking.",
      solution: "1. Join the official server (discord.gg/nebulaogfn) using the same account used for login.\n2. Close the launcher completely.\n3. Open it again and redo authentication."
    },
    es: {
      title: "Error 08 — Connection Failed",
      meaning: "Nébula no pudo completar la conexión con la cuenta vinculada.",
      cause: "Cuenta de Discord incorrecta, cuenta fuera del servidor oficial o proceso de vinculación incompleto.",
      identification: "Aparece CONNECTION FAILED después del inicio de sesión o la vinculación.",
      solution: "1. Entra al servidor oficial (discord.gg/nebulaogfn) con la misma cuenta usada para iniciar sesión.\n2. Cierra completamente el launcher.\n3. Ábrelo de nuevo y repite la autenticación."
    }
  },
  INVALID_FORTNITE_BUILD: {
    en: {
      title: "Error 09 — Invalid Fortnite Build",
      meaning: "Nébula is not recognizing the selected build folder.",
      cause: "The selected folder may be incorrect or incomplete.",
      identification: "The main Fortnite executable is missing from the expected path.",
      solution: "1. Locate the correct installation/build.\n2. Confirm FortniteGame > Binaries > Win64 exists.\n3. In Nébula, select the correct parent folder before FortniteGame.\n4. Try again."
    },
    es: {
      title: "Error 09 — Invalid Fortnite Build",
      meaning: "Nébula no reconoce la carpeta de la build seleccionada.",
      cause: "La carpeta seleccionada puede ser incorrecta o estar incompleta.",
      identification: "El ejecutable principal de Fortnite no aparece en la ruta esperada.",
      solution: "1. Localiza la instalación/build correcta.\n2. Confirma que exista FortniteGame > Binaries > Win64.\n3. En Nébula, selecciona la carpeta principal correcta, antes de FortniteGame.\n4. Inténtalo de nuevo."
    }
  },
  "0XC0000142": {
    en: {
      title: "Error 10 — 0xc0000142",
      meaning: "Windows could not start the program correctly because an essential DLL failed or was blocked.",
      cause: "Antivirus interference, missing Visual C++/DirectX, or corrupted system files.",
      identification: "The program does not open and error code 0xc0000142 appears.",
      solution: "1. Check antivirus Protection History and restore/allow Nébula files.\n2. Install/update Visual C++ Redistributable (x64) and DirectX.\n3. Run sfc /scannow in Administrator CMD.\n4. Restart and test again as Administrator."
    },
    es: {
      title: "Error 10 — 0xc0000142",
      meaning: "Windows no pudo iniciar correctamente el programa porque una DLL esencial falló o fue bloqueada.",
      cause: "Interferencia del antivirus, falta de Visual C++/DirectX o archivos del sistema dañados.",
      identification: "El programa no se abre y aparece el código 0xc0000142.",
      solution: "1. Revisa el Historial de protección del antivirus y restaura/permite los archivos de Nébula.\n2. Instala o actualiza Visual C++ Redistributable (x64) y DirectX.\n3. Ejecuta sfc /scannow en CMD como Administrador.\n4. Reinicia y prueba de nuevo como Administrador."
    }
  },
  INSTALACAO_CANCELADA: {
    en: {
      title: "Error 11 — Installation canceled (stage: cleanup)",
      meaning: "The installation stops before completion.",
      cause: "Missing permissions, antivirus blocking temporary files, or a synchronized folder such as OneDrive.",
      identification: "The installation cancels or freezes while saving files.",
      solution: "1. Create a local folder, for example C:\\Games\\Nebula.\n2. Disable the antivirus temporarily or add the folder to exclusions.\n3. Run Nébula as Administrator.\n4. Try the installation again."
    },
    es: {
      title: "Error 11 — Instalación cancelada (etapa: cleanup)",
      meaning: "La instalación se detiene antes de terminar.",
      cause: "Falta de permisos, antivirus bloqueando archivos temporales o una carpeta sincronizada como OneDrive.",
      identification: "La instalación se cancela o se congela mientras guarda archivos.",
      solution: "1. Crea una carpeta local, por ejemplo C:\\Juegos\\Nebula.\n2. Desactiva temporalmente el antivirus o añade la carpeta a exclusiones.\n3. Ejecuta Nébula como Administrador.\n4. Intenta instalar de nuevo."
    }
  },
  ACESSO_NEGADO_OS_ERROR_5: {
    en: {
      title: "Error 12 — Access denied / OS Error 5",
      meaning: "Windows is preventing Nébula from writing or changing files.",
      cause: "A OneDrive-synchronized folder or missing Administrator permissions.",
      identification: "Access denied or OS Error 5 appears.",
      solution: "1. Do not install on Desktop or Documents if they are inside OneDrive.\n2. Create a local folder such as C:\\Games\\Nebula.\n3. Run Nébula as Administrator.\n4. Select the new folder and try again."
    },
    es: {
      title: "Error 12 — Acceso denegado / OS Error 5",
      meaning: "Windows impide que Nébula escriba o modifique archivos.",
      cause: "Carpeta sincronizada con OneDrive o falta de permisos de Administrador.",
      identification: "Aparece Acceso denegado u OS Error 5.",
      solution: "1. No instales en Escritorio o Documentos si están dentro de OneDrive.\n2. Crea una carpeta local como C:\\Juegos\\Nebula.\n3. Ejecuta Nébula como Administrador.\n4. Selecciona la nueva carpeta e inténtalo de nuevo."
    }
  },
  INCONSISTENCIA_HARDWARE: {
    en: {
      title: "Error 13 — Hardware identity inconsistencies",
      meaning: "Anticheat security warning: the system detected software altering the computer's real identity.",
      cause: "HWID spoofers, virtual machines (VMware, VirtualBox, Hyper-V), modified drivers, or aggressive security software.",
      identification: "The issue persists on a modified Windows environment or a non-standard virtualized setup.",
      solution: "1. Use a native Windows environment.\n2. Completely remove spoofers or identity-modification software.\n3. Avoid virtual machines.\n4. Restart the computer and test again."
    },
    es: {
      title: "Error 13 — Inconsistencias de identidad de hardware",
      meaning: "Advertencia de seguridad del anticheat: el sistema detectó software que altera la identidad real del equipo.",
      cause: "HWID spoofers, máquinas virtuales (VMware, VirtualBox, Hyper-V), drivers modificados o software de seguridad agresivo.",
      identification: "El problema continúa en un Windows modificado o en un entorno virtualizado fuera de lo normal.",
      solution: "1. Usa un entorno Windows nativo.\n2. Elimina por completo cualquier spoofer o software que altere la identidad.\n3. Evita máquinas virtuales.\n4. Reinicia el equipo y prueba de nuevo."
    }
  },
  PROGRAMA_BLOQUEADO: {
    en: {
      title: "Error 14 — Program blocked",
      meaning: "The antivirus or Windows Defender may be blocking Nébula and basic Windows tools such as PowerShell.",
      cause: "Having multiple antivirus products installed can cause severe conflicts with the anticheat.",
      identification: "Protection History shows a block at the same time Nébula tries to open.",
      solution: "1. Uninstall third-party antivirus products such as Avast, Kaspersky, AVG, McAfee, or Avira.\n2. Keep only Windows Defender enabled.\n3. Restart the computer.\n4. Run Nébula as Administrator."
    },
    es: {
      title: "Error 14 — Programa bloqueado",
      meaning: "El antivirus o Windows Defender puede estar bloqueando Nébula y herramientas básicas de Windows como PowerShell.",
      cause: "Tener varios antivirus instalados puede causar conflictos graves con el anticheat.",
      identification: "El Historial de protección muestra un bloqueo justo cuando Nébula intenta abrirse.",
      solution: "1. Desinstala antivirus de terceros como Avast, Kaspersky, AVG, McAfee o Avira.\n2. Deja solo Windows Defender activo.\n3. Reinicia el equipo.\n4. Ejecuta Nébula como Administrador."
    }
  },
  INSTALLATION_DIRECTORY: {
    en: {
      title: "Error 15 — Installation Directory must be on a local hard drive",
      meaning: "The selected installation folder is not on a local physical drive.",
      cause: "The installer may be pointing to OneDrive or a removable drive.",
      identification: "Check whether Nébula is being installed inside OneDrive or another synchronized/removable location.",
      solution: "1. Click Change in the installer.\n2. Install directly on the local disk, for example C:\\Nebula.\n3. Avoid paths containing OneDrive, Desktop, or Documents."
    },
    es: {
      title: "Error 15 — Installation Directory must be on a local hard drive",
      meaning: "La carpeta elegida para instalar no está en un disco físico local.",
      cause: "El instalador puede estar apuntando a OneDrive o a una unidad extraíble.",
      identification: "Revisa si Nébula está instalado dentro de OneDrive u otra ubicación sincronizada o extraíble.",
      solution: "1. Haz clic en Change en el instalador.\n2. Instala directamente en el disco local, por ejemplo C:\\Nebula.\n3. Evita rutas que contengan OneDrive, Desktop o Documentos."
    }
  },
  DOWNLOAD_CONTENT_PAKS: {
    en: {
      title: "Error 16 — download_content_archive / paks.rar",
      meaning: "A required file is missing or the download did not finish correctly.",
      cause: "Installing the game inside OneDrive can interfere with synchronization and corrupt the paks.rar download.",
      identification: "paks.rar is missing from FortniteGame\\Content\\Paks or the file is incomplete.",
      solution: "1. Move the game outside OneDrive, for example C:\\Games\\Nebula.\n2. Delete the incomplete paks.rar in FortniteGame\\Content\\Paks.\n3. Point the launcher to the folder again.\n4. Run as Administrator and download again."
    },
    es: {
      title: "Error 16 — download_content_archive / paks.rar",
      meaning: "Falta un archivo necesario o la descarga no terminó correctamente.",
      cause: "Instalar el juego dentro de OneDrive puede interferir con la sincronización y dañar la descarga de paks.rar.",
      identification: "paks.rar no aparece en FortniteGame\\Content\\Paks o está incompleto.",
      solution: "1. Mueve el juego fuera de OneDrive, por ejemplo C:\\Juegos\\Nebula.\n2. Elimina el paks.rar incompleto en FortniteGame\\Content\\Paks.\n3. Vuelve a seleccionar la carpeta en el launcher.\n4. Ejecuta como Administrador y descarga de nuevo."
    }
  },
  CONTROLE_NAO_FUNCIONA: {
    en: {
      title: "Error 17 — Controller not working",
      meaning: "The controller connects, but the game is not recognizing its inputs correctly.",
      cause: "Steam, mapping software, or another connected peripheral causing input conflicts.",
      identification: "The controller appears connected but does not work correctly in-game.",
      solution: "1. Close Steam completely.\n2. For PS4/PS5 controllers, use DS4Windows emulating Xbox 360 (or x360ce for generic controllers).\n3. Disconnect other USB peripherals.\n4. Run the launcher as Administrator before starting the game."
    },
    es: {
      title: "Error 17 — El control no funciona",
      meaning: "El control se conecta, pero el juego no reconoce correctamente los comandos.",
      cause: "Steam, software de mapeo u otro periférico conectado causando conflictos de entrada.",
      identification: "El control aparece conectado pero no funciona correctamente dentro del juego.",
      solution: "1. Cierra Steam por completo.\n2. Para controles PS4/PS5, usa DS4Windows emulando Xbox 360 (o x360ce para controles genéricos).\n3. Desconecta otros periféricos USB.\n4. Ejecuta el launcher como Administrador antes de abrir el juego."
    }
  },
  LAUNCH_BLOCKED: {
    en: {
      title: "Launch Blocked (EOSOverlayRenderer stuck)",
      meaning: "An Epic Games process is stuck in the background and prevents Nébula from opening.",
      cause: "EOSOverlayRenderer-Win64-Shipping.exe did not close correctly in the previous session.",
      identification: "The launcher displays Launch Blocked when trying to start.",
      solution: "1. Open Task Manager (Ctrl + Shift + Esc).\n2. Find EOSOverlayRenderer-Win64-Shipping.exe.\n3. Right-click it and choose End task.\n4. Open Nébula again."
    },
    es: {
      title: "Launch Blocked (EOSOverlayRenderer bloqueado)",
      meaning: "Un proceso de Epic Games quedó bloqueado en segundo plano e impide abrir Nébula.",
      cause: "EOSOverlayRenderer-Win64-Shipping.exe no se cerró correctamente en la sesión anterior.",
      identification: "El launcher muestra Launch Blocked al intentar iniciar.",
      solution: "1. Abre el Administrador de tareas (Ctrl + Shift + Esc).\n2. Busca EOSOverlayRenderer-Win64-Shipping.exe.\n3. Haz clic derecho y elige Finalizar tarea.\n4. Abre Nébula de nuevo."
    }
  },
  FILE_HASH_MISMATCH: {
    en: {
      title: "Error 01 — file_hash_mismatch",
      meaning: "A required file does not match the expected hash, usually because antivirus blocked a TundraV2 anticheat file as a false positive.",
      cause: "Windows Defender or another antivirus blocked a required Nébula file.",
      identification: "A Nébula file appears in antivirus Protection History or quarantine.",
      solution: "1. Open Windows Security/antivirus.\n2. Go to Virus & threat protection > Protection history.\n3. Find Nébula-related blocks and choose Allow/Restore.\n4. Add the Nébula folder to antivirus exclusions.\n5. Close the launcher and reopen it as Administrator."
    },
    es: {
      title: "Error 01 — file_hash_mismatch",
      meaning: "Un archivo necesario no coincide con el hash esperado, normalmente porque el antivirus bloqueó un archivo del anticheat TundraV2 como falso positivo.",
      cause: "Windows Defender u otro antivirus bloqueó un archivo necesario de Nébula.",
      identification: "Un archivo de Nébula aparece en el Historial de protección o en la cuarentena del antivirus.",
      solution: "1. Abre Seguridad de Windows/antivirus.\n2. Ve a Protección contra virus y amenazas > Historial de protección.\n3. Busca bloqueos relacionados con Nébula y elige Permitir/Restaurar.\n4. Añade la carpeta de Nébula a las exclusiones del antivirus.\n5. Cierra el launcher y ábrelo de nuevo como Administrador."
    }
  },
  SEM_CONEXAO: {
    en: {
      title: "Error 02 — No connection",
      meaning: "Nébula cannot connect to the servers.",
      cause: "Unstable internet, VPN, proxy, firewall, or antivirus blocking the connection.",
      identification: "No connection appears even though internet works normally in other apps.",
      solution: "1. Check your internet connection.\n2. Disable VPN or proxy for testing.\n3. Check firewall and antivirus.\n4. Restart the modem/router.\n5. Open Nébula again as Administrator."
    },
    es: {
      title: "Error 02 — Sin conexión",
      meaning: "Nébula no puede conectarse a los servidores.",
      cause: "Internet inestable, VPN, proxy, firewall o antivirus bloqueando la conexión.",
      identification: "Aparece Sin conexión aunque internet funcione normalmente en otras aplicaciones.",
      solution: "1. Revisa tu conexión a internet.\n2. Desactiva VPN o proxy para probar.\n3. Revisa firewall y antivirus.\n4. Reinicia el módem/router.\n5. Abre Nébula de nuevo como Administrador."
    }
  },
  CONTA_RECEM_CRIADA: {
    en: {
      title: "Error 03 — Newly created account",
      meaning: "New Discord accounts may have trouble authenticating.",
      cause: "For security, the Discord account must be at least 30 days old to log in to Nébula.",
      identification: "The error appears while linking or signing in with a newly created Discord account.",
      solution: "1. Check the Discord account creation date.\n2. Use an older Discord account (30+ days).\n3. Link/sign in again.\n4. Retry authentication."
    },
    es: {
      title: "Error 03 — Cuenta recién creada",
      meaning: "Las cuentas nuevas de Discord pueden tener problemas para autenticarse.",
      cause: "Por seguridad, la cuenta de Discord debe tener al menos 30 días para iniciar sesión en Nébula.",
      identification: "El error aparece al vincular o iniciar sesión con una cuenta de Discord recién creada.",
      solution: "1. Revisa la fecha de creación de la cuenta de Discord.\n2. Usa una cuenta más antigua (30+ días).\n3. Vuelve a vincular/iniciar sesión.\n4. Intenta autenticarte de nuevo."
    }
  }
};

export function localizeKnownError(error, lang = "pt") {
  if (!error || lang === "pt") return error;
  const translated = T[error.code]?.[lang];
  if (!translated) return error;
  return { ...error, ...translated };
}

export function hasKnownErrorTranslation(code, lang) {
  return lang === "pt" || Boolean(T[code]?.[lang]);
}

export default T;
