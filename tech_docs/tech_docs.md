Co Geoportal może dać projektowi

  1. KIUT — sieci uzbrojenia terenu (WMS, bezpłatny)

  Najważniejsze dla Ciebie. Endpoint: https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu

  Agreguje dane powiatowe w jeden serwis WMS. Zawiera:
  - Sieć wodociągowa
  - Sieć kanalizacyjna
  - Sieć gazowa
  - Sieć energetyczna (niskie/średnie napięcie)
  - Sieć telekomunikacyjna
  - Ciepłociągi

  Ograniczenie: To jest tylko WMS (serwis wizualny — tilesety PNG). Możesz go wyświetlić na mapie jako tło, ale nie dostaniesz wektorów (GeoJSON/WKT) do analizy zależności. Do tego potrzebny WFS z GESUT — który od XII 2025 GUGiK
  zaplanował jako płatny.

  ---
  2. BDOT10k — baza topograficzna (WFS, bezpłatny)

  WFS: https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k

  Klasy obiektów do pobrania jako wektory:

  ┌───────┬──────────────────────┬──────────────────────────┐
  │ Klasa │      Zawartość       │       Przydatność        │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ SWRS  │ Rzeki i strumienie   │ masz już z OSM           │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ SKDR  │ Drogi (sieć drogowa) │ szczegółowsza niż OSM    │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ SKLT  │ Linie kolejowe       │ szczegółowsza niż OSM    │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ BUBD  │ Budynki              │ dokładniejsze niż OSM    │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ TCPG  │ Przejścia graniczne  │ n/d                      │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ PTLZ  │ Lasy                 │ kontekst terenu          │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ OIKM  │ Mosty, wiadukty      │ infrastruktura krytyczna │
  ├───────┼──────────────────────┼──────────────────────────┤
  │ OICP  │ Przepusty, śluzy     │ infrastruktura wodna     │
  └───────┴──────────────────────┴──────────────────────────┘

  Nie zawiera sieci wodociągowej, gazowej ani energetycznej — to jest w GESUT/BDOT500.

  ---
  3. PRG — granice administracyjne (WFS, bezpłatny)

  https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries

  Granice gmin, powiatów, województw jako wektory — przydatne do odcięcia obszaru operacyjnego.

  ---
  4. Ortofotomapa (WMS/WMTS, bezpłatna)

  Zdjęcia lotnicze w rozdzielczości do 5–25 cm/piksel. Przydatne jako baza do wizualizacji offline zamiast kafelków OSM.

  ---
  5. NMT/NMPT — numeryczny model terenu (WCS, bezpłatny)

  Dane wysokościowe. Przydatne do analizy stref zalewowych wzdłuż Sanu.

  ---
  Co z wodociągami — realna ocena

  ┌────────────────────┬────────────────┬────────────────────┬────────────────────────┐
  │       Opcja        │    Wektory?    │       Koszt        │       Aktualność       │
  ├────────────────────┼────────────────┼────────────────────┼────────────────────────┤
  │ KIUT WMS           │ ❌ tylko obraz │ bezpłatny          │ z powiatów na bieżąco  │
  ├────────────────────┼────────────────┼────────────────────┼────────────────────────┤
  │ GESUT WFS          │ ✅             │ płatny od XII 2025 │ z powiatów na bieżąco  │
  ├────────────────────┼────────────────┼────────────────────┼────────────────────────┤
  │ BDOT500 WFS        │ ✅             │ płatny od XII 2025 │ rzadziej aktualizowany │
  ├────────────────────┼────────────────┼────────────────────┼────────────────────────┤
  │ OSM pipeline       │ ✅             │ bezpłatny          │ brak danych dla SW     │
  ├────────────────────┼────────────────┼────────────────────┼────────────────────────┤
  │ MPWiK Stalowa Wola │ ✅             │ umowa/wniosek      │ aktualne               │
  └────────────────────┴────────────────┴────────────────────┴────────────────────────┘

  Rekomendacja: Najszybsza ścieżka to wstawić warstwę KIUT WMS jako podkład wizualny (wodociągi widoczne na mapie), a dla faktycznej analizy zależności — zwrócić się bezpośrednio do MPWiK Stalowa Wola o dane w formacie SHP/GeoJSON,
  ewentualnie zapytać Starostwo Powiatowe w Stalowej Woli o dostęp do GESUT (jako podmiot realizujący zadania z zakresu zarządzania kryzysowego mają podstawę prawną do wnioskowania).

  Chcesz żebym:
  1. Dodał warstwę KIUT WMS do mapy jako podkład wizualny?
  2. Napisał skrypt do pobrania BDOT10k (mosty, drogi, budynki) dla obszaru SW?

  Sources:
  - Topographic Objects Database (BDOT10k) – Geoportal.gov.pl
  - Uzbrojenie terenu (GESUT) – Geoportal.gov.pl
  - KIUT – Krajowa Integracja Uzbrojenia Terenu (endpoint)
  - Download service (WFS) – Geoportal.gov.pl
  - Geodezyjna Ewidencja Sieci Uzbrojenia Terenu – GUGiK