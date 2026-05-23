PROCEDURY OBRONY PRZECIWDRONOWEJ (C-UAS)
Dokument: CUAV-OBR-2026
Klasyfikacja: JAWNE — materiał szkoleniowy

ROZDZIAŁ 1. KLASYFIKACJA ZAGROŻEŃ BEZZAŁOGOWYCH

1.1 Kategorie dronów wg zagrożenia
Kategoria I — Mikro (masa <2 kg)
Zasięg: do 5 km. Pułap: do 150m AGL.
Czas lotu: 15-30 minut. Prędkość: do 60 km/h.
Zagrożenie: rozpoznanie, przenoszenie ładunków do 500g.
Przykłady: DJI Mini, drony FPV z modyfikacjami.
Wykrywalność: niska — mały RCS (0.01 m²), cichy silnik.

Kategoria II — Taktyczny (masa 2-25 kg)
Zasięg: do 50 km. Pułap: do 500m AGL.
Czas lotu: 30-120 minut. Prędkość: do 120 km/h.
Zagrożenie: rozpoznanie, celowane uderzenia, przenoszenie ładunków do 5 kg.
Przykłady: DJI Matrice, Autel EVO Max, drony FPV bojowe.
Wykrywalność: średnia — wykrywalny przez radar od 3-5 km.

Kategoria III — Amunicja krążąca (masa 10-50 kg)
Zasięg: 30-300 km. Pułap: do 3000m.
Czas lotu: 1-6 godzin. Prędkość: do 250 km/h.
Zagrożenie: precyzyjne uderzenie w infrastrukturę, głowica bojowa 3-15 kg.
Przykłady: Shahed-136, Lancet, Warmate (polska).
Wykrywalność: średnia-wysoka — wykrywalny przez radar od 10-15 km.

1.2 Typowe profile ataku na infrastrukturę krytyczną
Profil A — Pojedynczy dron rozpoznawczy
Cel: zbieranie danych o obiekcie przed atakiem.
Czas trwania: 5-15 minut nad celem.
Reakcja: obserwacja, identyfikacja operatora, dokumentacja.

Profil B — Atak pojedynczym dronem FPV
Cel: precyzyjne uderzenie w konkretny element (transformator, pompownia).
Czas od wykrycia do uderzenia: 30-120 sekund.
Reakcja: natychmiastowy jammer RF, alert personelu, ewakuacja strefy.

Profil C — Atak rojem (swarm)
Cel: przełamanie obrony, wielokierunkowe uderzenie.
Liczba dronów: 3-20 jednocześnie.
Czas od wykrycia do uderzenia: 60-180 sekund.
Reakcja: wielowarstwowa obrona, priorytetyzacja celów, ewakuacja.

Profil D — Amunicja krążąca z dużej odległości
Cel: uderzenie w obiekt strategiczny (elektrownia, węzeł kolejowy).
Czas ostrzegania: 5-30 minut (zależy od zasięgu radaru).
Reakcja: alert regionalny, aktywacja systemów OPL, ewakuacja strefy rażenia.

ROZDZIAŁ 2. PROCEDURY WYKRYWANIA

2.1 System wielowarstwowy (Layered Detection)
Warstwa 1 — Radar (zasięg 5-15 km)
Ciągłe skanowanie 360°. Wykrywa obiekty >0.01 m² RCS.
Ograniczenia: martwe strefy za przeszkodami terenowymi.
Rekomendowane rozmieszczenie: punkt podwyższony z pokryciem osi zagrożeń.

Warstwa 2 — Detekcja RF (zasięg 2-5 km)
Pasywne nasłuchiwanie sygnałów sterowania dronem.
Identyfikacja protokołu (DJI, analógowe FPV, Crossfire).
Ograniczenia: nie wykrywa dronów autonomicznych (bez łączności RF).

Warstwa 3 — Elektrooptyczna/podczerwień (zasięg 1-3 km)
Kamery dzień/noc z algorytmami detekcji.
Identyfikacja wizualna typu drona.
Ograniczenia: pogoda (mgła, deszcz), pora dnia.

Warstwa 4 — Akustyczna (zasięg 300m-1 km)
Mikrofony kierunkowe wykrywające szum silnika.
Niski koszt, uzupełnienie innych warstw.
Ograniczenia: hałas miejski, wiatr.

Warstwa 5 — Obserwacja wzrokowa (zasięg wizualny)
Patrole i posterunki obserwacyjne.
Zgłoszenia od ludności cywilnej.
Ograniczenia: subiektywność, opóźnienie zgłoszenia.

2.2 Procedura po wykryciu
Krok 1: Klasyfikacja zagrożenia (Kat. I/II/III) — automatycznie lub manualnie.
Krok 2: Określenie kierunku zbliżania i prędkości.
Krok 3: Identyfikacja potencjalnego celu (który obiekt jest zagrożony).
Krok 4: Alert do systemu dowodzenia CrisisCommand.
Krok 5: Aktywacja odpowiedniej procedury neutralizacji.
Czas: od wykrycia do decyzji max 30 sekund.

ROZDZIAŁ 3. PROCEDURY NEUTRALIZACJI

3.1 Neutralizacja elektroniczna (soft kill)
Jammer RF — zagłuszanie częstotliwości sterowania.
Skuteczność: wysoka przeciw Kat. I-II z pilotem.
Nieskuteczne: drony autonomiczne, amunicja krążąca z INS.
Ograniczenia prawne: zakaz używania w pobliżu lotnisk,
szpitali (zakłóca sprzęt medyczny), telekomunikacji.

Spoofing GPS — podanie fałszywego sygnału nawigacyjnego.
Skuteczność: średnia — nowsze drony mają multi-GNSS.
Ryzyko: wpływ na inne systemy GPS w okolicy.

3.2 Neutralizacja kinetyczna (hard kill)
Drony przechwytujące — dron myśliwski przechwytuje intruza.
Czas reakcji: 15-60 sekund od decyzji do przechwycenia.
Przykład: Anduril Anvil, polska Warmate w trybie air-to-air.

Sieci przechwytujące — wyrzutnia sieciowa lub dron z siecią.
Zasięg: do 100m. Skuteczność: wysoka dla Kat. I.

Amunicja dedykowana — strzelanie do drona.
Ryzyko: odłamki w terenie zurbanizowanym.
Stosować TYLKO poza terenem zabudowanym lub w ostateczności.

3.3 Priorytetyzacja celów przy ataku rojem
Priorytet 1: drony zbliżające się do obiektów Kat. 5 (szpital, elektrownia).
Priorytet 2: drony z widocznym ładunkiem.
Priorytet 3: drony w fazie nurkowania (terminal attack).
Priorytet 4: drony rozpoznawcze (niższe zagrożenie natychmiastowe).

ROZDZIAŁ 4. STREFY OBRONY

4.1 Strefa zewnętrzna (5-15 km od obiektu)
Detekcja: radar, ADS-B.
Reakcja: obserwacja, klasyfikacja, alert.
Czas na decyzję: 3-10 minut.

4.2 Strefa pośrednia (1-5 km)
Detekcja: radar + RF + EO/IR.
Reakcja: aktywacja jammera, przygotowanie neutralizacji kinetycznej.
Czas na decyzję: 30-120 sekund.

4.3 Strefa wewnętrzna (<1 km)
Detekcja: wszystkie warstwy aktywne.
Reakcja: natychmiastowa neutralizacja, ewakuacja personelu.
Czas na decyzję: <30 sekund.
Alert personelu: automatyczny — syrena + komunikat w systemie mesh.

4.4 Strefa krytyczna (<100m)
Ostatnia linia obrony.
Ochrona pasywna: hardening konstrukcji, bariery fizyczne.
Ewakuacja: personel powinien być już w schronie.

ROZDZIAŁ 5. RAPORTOWANIE I DOKUMENTACJA

5.1 Raport po incydencie dronowym (format)
CZAS wykrycia: [HH:MM]
CZAS neutralizacji: [HH:MM]
KATEGORIA drona: [I/II/III]
KIERUNEK zbliżania: [N/NE/E/SE/S/SW/W/NW]
METODA wykrycia: [radar/RF/EO/akustyczna/wzrokowa]
METODA neutralizacji: [jammer/kinetyczna/autonomiczna ucieczka]
OBIEKT zagrożony: [nazwa]
SKUTKI: [brak/uszkodzenie/zniszczenie]
WNIOSKI: [tekst wolny]
