# Pustelnia

Generatywna aplikacja muzyczna w klimacie klasztorno-pustynnym: chorał gregoriański śpiewany na żywo przez męską scholę, ison i organum, chór dziecięcy, organy, basy z wielu oscylatorów przepuszczane przez lampowy wzmacniacz liczony z fizyki, syntezatory, dzwony dzwonnicy, sygnaturka, dzwony rurowe, łańcuchy, kadzielnica, semantron i wiatr pustyni.

- `index.html` + `css/` + `js/` – aplikacja (przeglądarka i Android).
- `android/` + `.github/workflows/android.yml` – GitHub sam buduje plik APK po każdej zmianie (zakładka **Releases** → `pustelnia.apk`).
- `sample/` – biblioteka sampli (MP3, spis w `sample/manifest.json`).
- `ir/` – przestrzenie: policzone z geometrii (jaskinia, kaplica, krypta, bazylika, cysterna, dziedziniec, kanion, wydmy), prawdziwe nagrania miejsc i kolumny głośnikowe policzone z fizyki.
- `narzedzia/` – skrypty, którymi przygotowano sample, przestrzenie i ikonę.

## Akordy, rytm, wydajność

- **Własne akordy** (karta „Akordy i rytm”): np. `Dm C Dm:2 | F C Dm:2`. Melodia chorału jest naginana do skali akordu, a mocne sylaby lądują na dźwiękach akordu; ison, organy, bas i syntezatory idą za akordami.
- **Rytm**: swobodny (jak chorał) albo w metrum (2/4 … 12/8, 7/8, 5/8) z tempem taktu. Wzory rytmu dla bębna ramowego, dzwonów, łańcuchów i semantronu: `x` mocno, `o` cicho, `.` pauza, każdy znak to ósemka.
- **Spółgłoski**: wyłączone (płynne legato samogłosek), delikatne albo pełne.
- **Wydajność**: na telefonie automatycznie tryb lekki – uproszczony wzmacniacz lampowy (te same lampy, krzywe i barwa, bez rozwiązywania całego układu co próbkę), mniej głosów syntezatora, krótsze pogłosy, dzwony liczone raz do bufora, 32 kHz, wolniejsza animacja.

## Jak to działa

| Plik | Co tam jest |
|---|---|
| `js/theory.js` | 8 modusów kościelnych (finalis, ton recytacyjny, ambitus, B i B♭), teksty łacińskie z akcentami, podział na sylaby, samogłoski i spółgłoski, generator melodii chorału (neumy, melizmaty, intonacja, recytacja, kadencje), organum z occursus |
| `js/engine.js` | części (tekst śpiewany wers po wersie), frazy w swobodnym rytmie, gracze: schola, ison/organum, dzieci (alternatim, oktawa, odpowiedzi), organy, bas, syntezatory, dzwony, łańcuchy, kadzielnica, semantron |
| `js/audio.js` | wczytywanie sampli, chór z legato i spółgłoskami, organy z pętlą, dzwon dzwonnicy (synteza modalna), semantron, wiatr, połączenie z syntezatorami |
| `js/wk/synth.js` | syntezator w AudioWorklet z 18 rodzajami oscylatorów: sinus, trójkąt, piła i prostokąt bez aliasingu (z PWM), supersaw, FM 2- i 3-operatorowe, zwijacz fali, synchronizacja, modulacja kołowa, alikwoty, formanty FOF, szum strojony, struna Karplusa-Stronga, oscylator chaotyczny, tablica fal, zniekształcenie fazy, sub-oktawa |
| `js/wk/amp.js` | lampowy wzmacniacz liczony próbka po próbce (12AX7, odwracacz fazy, EL84 z autopolaryzacją, transformator z nasyceniem i histerezą, prostownik GZ34/5U4/krzemowy, zasilacz z ugięciem, głośnik jako obciążenie, szum lamp, tolerancje) |
| `js/patches.js` | brzmienia basów i syntezatorów (każde to stos różnych oscylatorów) |
| `js/mixer.js` | mikser: tor dla każdej warstwy i przestrzeń |
| `js/scene.js` | tło: pustynia, góry, wydmy, klasztor z dzwonnicą i kopułą, pustelnie w skale |

Melodie nie są kopiowane z istniejących śpiewów: powstają na bieżąco według reguł chorału.

## Licencje sampli

| Folder | Źródło | Licencja |
|---|---|---|
| schola, bas, dzieci | [epic-choir](https://github.com/thepok/epic-choir) (thepok), z nagrań [VocalSet](https://doi.org/10.5281/zenodo.1442513). Chór dziecięcy: soprany i alty z przesuniętymi formantami | **CC BY 4.0** – wymagane podanie autorów (`sample/ATTRIBUTION-chor.txt`) |
| organy_*, pozytyw_* | VCSL (organy: Simon Dalzell / Ivy Audio) | CC0 |
| dzwony_rurowe*, dzwonki_*, gong*, cymbalki, dzwoneczki_kadzielnicy, kowadlo | [VCSL](https://github.com/sgossner/VCSL) | CC0 |
| lancuchy | syntetyzowane (`narzedzia/prep.py`) | – |

Przestrzenie „nagrania”: [IR Library](https://github.com/itsmusician/IR-Library) (Conner, MIT, `ir/LICENSE-IR-Library.md`). Teksty: psalmy, prorocy i liturgia łacińska (domena publiczna).

> Choir samples derived from VocalSet (Wilkins, Seetharaman, Wahl, Pardo 2018), CC BY 4.0, https://doi.org/10.5281/zenodo.1442513 — epic-choir by thepok
