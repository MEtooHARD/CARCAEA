
Classification and regression models based on embeddings. Instead of working with mel-spectrograms, these models require embeddings as input. The name of these models is a combination of the classification/regression task and the name of the embedding model that should be used to extract embeddings (<classification_task>-<embedding_model>).

Note: TensorflowPredict2D has to be configured with the correct output layer name for each classifier. Check the attached JSON file to find the name of the output layer on each case.

# Music genre and style
## Genre Discogs400
Music style classification by 400 styles from the Discogs taxonomy:
```
Blues: Boogie Woogie, Chicago Blues, Country Blues, Delta Blues, Electric Blues, Harmonica Blues, Jump Blues, Louisiana Blues, Modern Electric Blues, Piano Blues, Rhythm & Blues, Texas Blues
Brass & Military: Brass Band, Marches, Military
Children's: Educational, Nursery Rhymes, Story
Classical: Baroque, Choral, Classical, Contemporary, Impressionist, Medieval, Modern, Neo-Classical, Neo-Romantic, Opera, Post-Modern, Renaissance, Romantic
Electronic: Abstract, Acid, Acid House, Acid Jazz, Ambient, Bassline, Beatdown, Berlin-School, Big Beat, Bleep, Breakbeat, Breakcore, Breaks, Broken Beat, Chillwave, Chiptune, Dance-pop, Dark Ambient, Darkwave, Deep House, Deep Techno, Disco, Disco Polo, Donk, Downtempo, Drone, Drum n Bass, Dub, Dub Techno, Dubstep, Dungeon Synth, EBM, Electro, Electro House, Electroclash, Euro House, Euro-Disco, Eurobeat, Eurodance, Experimental, Freestyle, Future Jazz, Gabber, Garage House, Ghetto, Ghetto House, Glitch, Goa Trance, Grime, Halftime, Hands Up, Happy Hardcore, Hard House, Hard Techno, Hard Trance, Hardcore, Hardstyle, Hi NRG, Hip Hop, Hip-House, House, IDM, Illbient, Industrial, Italo House, Italo-Disco, Italodance, Jazzdance, Juke, Jumpstyle, Jungle, Latin, Leftfield, Makina, Minimal, Minimal Techno, Modern Classical, Musique Concrète, Neofolk, New Age, New Beat, New Wave, Noise, Nu-Disco, Power Electronics, Progressive Breaks, Progressive House, Progressive Trance, Psy-Trance, Rhythmic Noise, Schranz, Sound Collage, Speed Garage, Speedcore, Synth-pop, Synthwave, Tech House, Tech Trance, Techno, Trance, Tribal, Tribal House, Trip Hop, Tropical House, UK Garage, Vaporwave
Folk, World, & Country: African, Bluegrass, Cajun, Canzone Napoletana, Catalan Music, Celtic, Country, Fado, Flamenco, Folk, Gospel, Highlife, Hillbilly, Hindustani, Honky Tonk, Indian Classical, Laïkó, Nordic, Pacific, Polka, Raï, Romani, Soukous, Séga, Volksmusik, Zouk, Éntekhno
Funk / Soul: Afrobeat, Boogie, Contemporary R&B, Disco, Free Funk, Funk, Gospel, Neo Soul, New Jack Swing, P.Funk, Psychedelic, Rhythm & Blues, Soul, Swingbeat, UK Street Soul
Hip Hop: Bass Music, Boom Bap, Bounce, Britcore, Cloud Rap, Conscious, Crunk, Cut-up/DJ, DJ Battle Tool, Electro, G-Funk, Gangsta, Grime, Hardcore Hip-Hop, Horrorcore, Instrumental, Jazzy Hip-Hop, Miami Bass, Pop Rap, Ragga HipHop, RnB/Swing, Screw, Thug Rap, Trap, Trip Hop, Turntablism
Jazz: Afro-Cuban Jazz, Afrobeat, Avant-garde Jazz, Big Band, Bop, Bossa Nova, Contemporary Jazz, Cool Jazz, Dixieland, Easy Listening, Free Improvisation, Free Jazz, Fusion, Gypsy Jazz, Hard Bop, Jazz-Funk, Jazz-Rock, Latin Jazz, Modal, Post Bop, Ragtime, Smooth Jazz, Soul-Jazz, Space-Age, Swing
Latin: Afro-Cuban, Baião, Batucada, Beguine, Bolero, Boogaloo, Bossanova, Cha-Cha, Charanga, Compas, Cubano, Cumbia, Descarga, Forró, Guaguancó, Guajira, Guaracha, MPB, Mambo, Mariachi, Merengue, Norteño, Nueva Cancion, Pachanga, Porro, Ranchera, Reggaeton, Rumba, Salsa, Samba, Son, Son Montuno, Tango, Tejano, Vallenato
Non-Music: Audiobook, Comedy, Dialogue, Education, Field Recording, Interview, Monolog, Poetry, Political, Promotional, Radioplay, Religious, Spoken Word
Pop: Ballad, Bollywood, Bubblegum, Chanson, City Pop, Europop, Indie Pop, J-pop, K-pop, Kayōkyoku, Light Music, Music Hall, Novelty, Parody, Schlager, Vocal
Reggae: Calypso, Dancehall, Dub, Lovers Rock, Ragga, Reggae, Reggae-Pop, Rocksteady, Roots Reggae, Ska, Soca
Rock: AOR, Acid Rock, Acoustic, Alternative Rock, Arena Rock, Art Rock, Atmospheric Black Metal, Avantgarde, Beat, Black Metal, Blues Rock, Brit Pop, Classic Rock, Coldwave, Country Rock, Crust, Death Metal, Deathcore, Deathrock, Depressive Black Metal, Doo Wop, Doom Metal, Dream Pop, Emo, Ethereal, Experimental, Folk Metal, Folk Rock, Funeral Doom Metal, Funk Metal, Garage Rock, Glam, Goregrind, Goth Rock, Gothic Metal, Grindcore, Grunge, Hard Rock, Hardcore, Heavy Metal, Indie Rock, Industrial, Krautrock, Lo-Fi, Lounge, Math Rock, Melodic Death Metal, Melodic Hardcore, Metalcore, Mod, Neofolk, New Wave, No Wave, Noise, Noisecore, Nu Metal, Oi, Parody, Pop Punk, Pop Rock, Pornogrind, Post Rock, Post-Hardcore, Post-Metal, Post-Punk, Power Metal, Power Pop, Power Violence, Prog Rock, Progressive Metal, Psychedelic Rock, Psychobilly, Pub Rock, Punk, Rock & Roll, Rockabilly, Shoegaze, Ska, Sludge Metal, Soft Rock, Southern Rock, Space Rock, Speed Metal, Stoner Rock, Surf, Symphonic Rock, Technical Death Metal, Thrash, Twist, Viking Metal, Yé-Yé
Stage & Screen: Musical, Score, Soundtrack, Theme
```
Models:

⬇️ genre_discogs400-discogs-effnet
⬇️ genre_discogs400-discogs-maest-5s-pw
⬇️ genre_discogs400-discogs-maest-10-pw
⬇️ genre_discogs400-discogs-maest-10s-fs
⬇️ genre_discogs400-discogs-maest-30s-dw
⬇️ genre_discogs400-discogs-maest-20s-pw
⬇️ genre_discogs400-discogs-maest-30s-pw
⬇️ genre_discogs400-discogs-maest-30s-pw-ts

## Genre Discogs519
Music style classification by 519 styles from the Discogs taxonomy:
```
Blues: Boogie Woogie, Chicago Blues, Country Blues, Delta Blues, East Coast Blues, Electric Blues, Harmonica Blues, Jump Blues, Louisiana Blues, Memphis Blues, Modern Electric Blues, Piano Blues, Piedmont Blues, Rhythm & Blues, Texas Blues
Brass & Military: Brass Band, Marches, Military, Pipe & Drum
Children's: Educational, Nursery Rhymes, Story
Classical: Baroque, Choral, Classical, Contemporary, Early, Impressionist, Medieval, Modern, Neo-Classical, Neo-Romantic, Opera, Operetta, Oratorio, Post-Modern, Renaissance, Romantic, Twelve-tone
Electronic: Abstract, Acid, Acid House, Acid Jazz, Ambient, Baltimore Club, Bassline, Beatdown, Berlin-School, Big Beat, Bleep, Breakbeat, Breakcore, Breaks, Broken Beat, Chillwave, Chiptune, Dance-pop, Dark Ambient, Darkwave, Deep House, Deep Techno, Disco, Disco Polo, Donk, Doomcore, Downtempo, Drone, Drum n Bass, Dub, Dub Techno, Dubstep, Dungeon Synth, EBM, Electro, Electro House, Electroacoustic, Electroclash, Euro House, Euro-Disco, Eurobeat, Eurodance, Experimental, Footwork, Freestyle, Future Jazz, Gabber, Garage House, Ghetto, Ghetto House, Ghettotech, Glitch, Glitch Hop, Goa Trance, Grime, Halftime, Hands Up, Happy Hardcore, Hard Beat, Hard House, Hard Techno, Hard Trance, Hardcore, Hardstyle, Harsh Noise Wall, Hi NRG, Hip Hop, Hip-House, House, IDM, Illbient, Industrial, Italo House, Italo-Disco, Italodance, J-Core, Jazzdance, Juke, Jumpstyle, Jungle, Latin, Leftfield, Lento Violento, Makina, Minimal, Minimal Techno, Modern Classical, Musique Concrète, Neo Trance, Neofolk, New Age, New Beat, New Wave, Noise, Nu-Disco, Power Electronics, Progressive Breaks, Progressive House, Progressive Trance, Psy-Trance, Rhythmic Noise, Schranz, Sound Collage, Speed Garage, Speedcore, Synth-pop, Synthwave, Tech House, Tech Trance, Techno, Trance, Tribal, Tribal House, Trip Hop, Tropical House, UK Funky, UK Garage, Vaporwave, Witch House
Folk, World, & Country: Aboriginal, African, Andalusian Classical, Andean Music, Appalachian Music, Basque Music, Bhangra, Bluegrass, Cajun, Canzone Napoletana, Carnatic, Catalan Music, Celtic, Chacarera, Chinese Classical, Chutney, Copla, Country, Cretan, Dangdut, Fado, Flamenco, Folk, Funaná, Gamelan, Ghazal, Gospel, Griot, Hawaiian, Highlife, Hillbilly, Hindustani, Honky Tonk, Indian Classical, Kaseko, Klezmer, Laïkó, Luk Thung, Maloya, Mbalax, Min'yō, Mizrahi, Nhạc Vàng, Nordic, Népzene, Ottoman Classical, Overtone Singing, Pacific, Pasodoble, Persian Classical, Phleng Phuea Chiwit, Polka, Qawwali, Raï, Rebetiko, Romani, Salegy, Sea Shanties, Soukous, Séga, Volksmusik, Western Swing, Zouk, Zydeco, Éntekhno
Funk / Soul: Afrobeat, Bayou Funk, Boogie, Contemporary R&B, Disco, Free Funk, Funk, Gogo, Gospel, Minneapolis Sound, Neo Soul, New Jack Swing, P.Funk, Psychedelic, Rhythm & Blues, Soul, Swingbeat, UK Street Soul
Hip Hop: Bass Music, Beatbox, Boom Bap, Bounce, Britcore, Cloud Rap, Conscious, Crunk, Cut-up/DJ, DJ Battle Tool, Electro, Favela Funk, G-Funk, Gangsta, Go-Go, Grime, Hardcore Hip-Hop, Hiplife, Horrorcore, Hyphy, Instrumental, Jazzy Hip-Hop, Kwaito, Miami Bass, Pop Rap, Ragga HipHop, RnB/Swing, Screw, Thug Rap, Trap, Trip Hop, Turntablism
Jazz: Afro-Cuban Jazz, Afrobeat, Avant-garde Jazz, Big Band, Bop, Bossa Nova, Cape Jazz, Contemporary Jazz, Cool Jazz, Dixieland, Easy Listening, Free Improvisation, Free Jazz, Fusion, Gypsy Jazz, Hard Bop, Jazz-Funk, Jazz-Rock, Latin Jazz, Modal, Post Bop, Ragtime, Smooth Jazz, Soul-Jazz, Space-Age, Swing
Latin: Afro-Cuban, Axé, Bachata, Baião, Batucada, Beguine, Bolero, Boogaloo, Bossanova, Carimbó, Cha-Cha, Charanga, Choro, Compas, Conjunto, Corrido, Cubano, Cumbia, Danzon, Descarga, Forró, Gaita, Guaguancó, Guajira, Guaracha, Jibaro, Lambada, MPB, Mambo, Mariachi, Marimba, Merengue, Música Criolla, Norteño, Nueva Cancion, Nueva Trova, Pachanga, Plena, Porro, Quechua, Ranchera, Reggaeton, Rumba, Salsa, Samba, Samba-Canção, Son, Son Montuno, Sonero, Tango, Tejano, Timba, Trova, Vallenato
Non-Music: Audiobook, Comedy, Dialogue, Education, Erotic, Field Recording, Health-Fitness, Interview, Monolog, Movie Effects, Poetry, Political, Promotional, Public Broadcast, Radioplay, Religious, Sermon, Sound Art, Sound Poetry, Special Effects, Speech, Spoken Word, Technical, Therapy
Pop: Ballad, Barbershop, Bollywood, Break-In, Bubblegum, Chanson, City Pop, Enka, Ethno-pop, Europop, Indie Pop, J-pop, K-pop, Karaoke, Kayōkyoku, Levenslied, Light Music, Music Hall, Novelty, Parody, Schlager, Vocal
Reggae: Calypso, Dancehall, Dub, Dub Poetry, Lovers Rock, Mento, Ragga, Reggae, Reggae Gospel, Reggae-Pop, Rocksteady, Roots Reggae, Ska, Soca, Steel Band
Rock: AOR, Acid Rock, Acoustic, Alternative Rock, Arena Rock, Art Rock, Atmospheric Black Metal, Avantgarde, Beat, Black Metal, Blues Rock, Brit Pop, Classic Rock, Coldwave, Country Rock, Crust, Death Metal, Deathcore, Deathrock, Depressive Black Metal, Doo Wop, Doom Metal, Dream Pop, Emo, Ethereal, Experimental, Folk Metal, Folk Rock, Funeral Doom Metal, Funk Metal, Garage Rock, Glam, Goregrind, Goth Rock, Gothic Metal, Grindcore, Groove Metal, Grunge, Hard Rock, Hardcore, Heavy Metal, Horror Rock, Indie Rock, Industrial, Industrial Metal, J-Rock, Jangle Pop, K-Rock, Krautrock, Lo-Fi, Lounge, Math Rock, Melodic Death Metal, Melodic Hardcore, Metalcore, Mod, NDW, Neofolk, New Wave, No Wave, Noise, Noisecore, Nu Metal, Oi, Parody, Pop Punk, Pop Rock, Pornogrind, Post Rock, Post-Hardcore, Post-Metal, Post-Punk, Power Metal, Power Pop, Power Violence, Prog Rock, Progressive Metal, Psychedelic Rock, Psychobilly, Pub Rock, Punk, Rock & Roll, Rock Opera, Rockabilly, Shoegaze, Ska, Skiffle, Sludge Metal, Soft Rock, Southern Rock, Space Rock, Speed Metal, Stoner Rock, Surf, Swamp Pop, Symphonic Rock, Technical Death Metal, Thrash, Twist, Viking Metal, Yé-Yé
Stage & Screen: Musical, Score, Soundtrack, Theme
```
Models:

⬇️ genre_discogs519

## MTG-Jamendo genre
Multi-label classification with the genre subset of MTG-Jamendo Dataset (87 classes):
```
60s, 70s, 80s, 90s, acidjazz, alternative, alternativerock, ambient, atmospheric, blues, bluesrock, bossanova, breakbeat,
celtic, chanson, chillout, choir, classical, classicrock, club, contemporary, country, dance, darkambient, darkwave,
deephouse, disco, downtempo, drumnbass, dub, dubstep, easylistening, edm, electronic, electronica, electropop, ethno,
eurodance, experimental, folk, funk, fusion, groove, grunge, hard, hardrock, hiphop, house, idm, improvisation, indie,
industrial, instrumentalpop, instrumentalrock, jazz, jazzfusion, latin, lounge, medieval, metal, minimal, newage, newwave,
orchestral, pop, popfolk, poprock, postrock, progressive, psychedelic, punkrock, rap, reggae, rnb, rock, rocknroll,
singersongwriter, soul, soundtrack, swing, symphonic, synthpop, techno, trance, triphop, world, worldfusion
```
Models:

⬇️ mtg_jamendo_genre-discogs-effnet
⬇️ mtg_jamendo_genre-discogs_artist_embeddings-effnet
⬇️ mtg_jamendo_genre-discogs_label_embeddings-effnet
⬇️ mtg_jamendo_genre-discogs_multi_embeddings-effnet
⬇️ mtg_jamendo_genre-discogs_release_embeddings-effnet
⬇️ mtg_jamendo_genre-discogs_track_embeddings-effnet

# Moods and context
## Approachability
Music approachability predicts whether the music is likely to be accessible to the general public (e.g., belonging to common mainstream music genres vs. niche and experimental genres). The models output rather two (approachability_2c) or three (approachability_3c) levels of approachability or continous values (approachability_regression).

Models:

⬇️ approachability_2c-discogs-effnet
⬇️ approachability_3c-discogs-effnet
⬇️ approachability_regression-discogs-effnet

## Engagement
Music engagement predicts whether the music evokes active attention of the listener (high-engagement “lean forward” active listening vs. low-engagement “lean back” background listening). The models output rather two (engagement_2c) or three (engagement_3c) levels of engagement or continuous (engagement_regression) values (regression).

Models:

⬇️ engagement_2c-discogs-effnet
⬇️ engagement_3c-discogs-effnet
⬇️ engagement_regression-discogs-effnet

## Arousal/valence DEAM
Music arousal and valence regression with the DEAM dataset (2 dimensions, range [1, 9]):
```
valence, arousal
```
Models:

⬇️ deam-msd-musicnn
⬇️ deam-audioset-vggish

## Arousal/valence emoMusic
Music arousal and valence regression with the emoMusic dataset (2 dimensions, range [1, 9]):
```
valence, arousal
```
Models:

⬇️ emomusic-msd-musicnn
⬇️ emomusic-audioset-vggish

## Arousal/valence MuSe
Music arousal and valence regression with the MuSE dataset (2 dimensions, range [1, 9]):
```
valence, arousal
```
Models:

⬇️ muse-msd-musicnn
⬇️ muse-audioset-vggish

## Danceability
Music danceability (2 classes):
```
danceable, not_danceable
```
Models:

⬇️ danceability-audioset-vggish
⬇️ danceability-audioset-yamnet
⬇️ danceability-discogs-effnet
⬇️ danceability-msd-musicnn
⬇️ danceability-openl3-music-mel128-emb512

## Mood Aggressive
Music classification by mood (2 classes):
```
aggressive, non_aggressive
```
Models:

⬇️ mood_aggressive-audioset-vggish
⬇️ mood_aggressive-audioset-yamnet
⬇️ mood_aggressive-discogs-effnet
⬇️ mood_aggressive-msd-musicnn
⬇️ mood_aggressive-openl3-music-mel128-emb512

## Mood Happy
Music classification by mood (2 classes):
```
happy, non_happy
```
Models:

⬇️ mood_happy-audioset-vggish
⬇️ mood_happy-audioset-yamnet
⬇️ mood_happy-discogs-effnet
⬇️ mood_happy-msd-musicnn
⬇️ mood_happy-openl3-music-mel128-emb512

## Mood Party
Music classification by mood (2 classes):
```
party, non_party
```
Models:

⬇️ mood_party-audioset-vggish
⬇️ mood_party-audioset-yamnet
⬇️ mood_party-discogs-effnet
⬇️ mood_party-msd-musicnn
⬇️ mood_party-openl3-music-mel128-emb512

## Mood Relaxed
Music classification by mood (2 classes):
```
relaxed, non_relaxed
```
Models:

⬇️ mood_relaxed-audioset-vggish
⬇️ mood_relaxed-audioset-yamnet
⬇️ mood_relaxed-discogs-effnet
⬇️ mood_relaxed-msd-musicnn
⬇️ mood_relaxed-openl3-music-mel128-emb512

## Mood Sad
Music classification by mood (2 classes):
```
sad, non_sad
```
Models:

⬇️ mood_sad-audioset-yvggish
⬇️ mood_sad-audioset-yamnet
⬇️ mood_sad-discogs-effnet
⬇️ mood_sad-msd-musicnn
⬇️ mood_sad-openl3-music-mel128-emb512

## Moods MIREX
Music classification by mood with the MIREX Audio Mood Classification Dataset (5 mood clusters):
```
1. passionate, rousing, confident, boisterous, rowdy
2. rollicking, cheerful, fun, sweet, amiable/good natured
3. literate, poignant, wistful, bittersweet, autumnal, brooding
4. humorous, silly, campy, quirky, whimsical, witty, wry
5. aggressive, fiery, tense/anxious, intense, volatile, visceral
```
Models:

⬇️ moods_mirex-msd-musicnn
⬇️ moods_mirex-audioset-vggish

## MTG-Jamendo mood and theme
Multi-label classification with mood and theme subset of the MTG-Jamendo Dataset (56 classes):
```
action, adventure, advertising, background, ballad, calm, children, christmas, commercial, cool, corporate, dark, deep,
documentary, drama, dramatic, dream, emotional, energetic, epic, fast, film, fun, funny, game, groovy, happy, heavy,
holiday, hopeful, inspiring, love, meditative, melancholic, melodic, motivational, movie, nature, party, positive,
powerful, relaxing, retro, romantic, sad, sexy, slow, soft, soundscape, space, sport, summer, trailer, travel, upbeat,
uplifting
```
Models:

⬇️ mtg_jamendo_moodtheme-discogs-effnet
⬇️ mtg_jamendo_moodtheme-discogs_artist_embeddings-effnet
⬇️ mtg_jamendo_moodtheme-discogs_label_embeddings-effnet
⬇️ mtg_jamendo_moodtheme-discogs_multi_embeddings-effnet
⬇️ mtg_jamendo_moodtheme-discogs_release_embeddings-effnet
⬇️ mtg_jamendo_moodtheme-discogs_track_embeddings-effnet

# Instrumentation
## MTG-Jamendo instrument
Multi-label classification using the instrument subset of the MTG-Jamendo Dataset (40 classes):
```
accordion, acousticbassguitar, acousticguitar, bass, beat, bell, bongo, brass, cello, clarinet, classicalguitar, computer,
doublebass, drummachine, drums, electricguitar, electricpiano, flute, guitar, harmonica, harp, horn, keyboard, oboe,
orchestra, organ, pad, percussion, piano, pipeorgan, rhodes, sampler, saxophone, strings, synthesizer, trombone, trumpet,
viola, violin, voice
```
Models:

⬇️ mtg_jamendo_instrument-discogs-effnet
⬇️ mtg_jamendo_instrument-discogs_artist_embeddings-effnet
⬇️ mtg_jamendo_instrument-discogs_label_embeddings-effnet
⬇️ mtg_jamendo_instrument-discogs_multi_embeddings-effnet
⬇️ mtg_jamendo_instrument-discogs_release_embeddings-effnet
⬇️ mtg_jamendo_instrument-discogs_track_embeddings-effnet

## Music loop instrument role
Classification of music loops by their instrument role using the Freesound Loop Dataset (5 classes):
```
bass, chords, fx, melody, percussion
```
Models:

⬇️ fs_loop_ds-msd-musicnn

## Mood Acoustic
Music classification by type of sound (2 classes):
```
acoustic, non_acoustic
```
Models:

⬇️ mood_acoustic-audioset-vggish
⬇️ mood_acoustic-audioset-yamnet
⬇️ mood_acoustic-discogs-effnet
⬇️ mood_acoustic-msd-musicnn
⬇️ mood_acoustic-openl3-music-mel128-emb512

## Mood Electronic
Music classification by type of sound (2 classes):
```
electronic, non_electronic
```
Models:

⬇️ mood_electronic-audioset-vggish
⬇️ mood_electronic-audioset-yamnet
⬇️ mood_electronic-discogs-effnet
⬇️ mood_electronic-msd-musicnn
⬇️ mood_electronic-openl3-music-mel128-emb512

## Voice/instrumental
Classification of music by presence or absence of voice (2 classes):
```
instrumental, voice
```
Models:

⬇️ voice_instrumental-audioset-vggish
⬇️ voice_instrumental-audioset-yamnet
⬇️ voice_instrumental-discogs-effnet
⬇️ voice_instrumental-msd-musicnn
⬇️ voice_instrumental-openl3-music-mel128-emb512

## Voice gender
Classification of music by singing voice gender (2 classes):
```
female, male
```
Models:

⬇️ gender-audioset-vggish
⬇️ gender-audioset-yamnet
⬇️ gender-discogs-effnet
⬇️ gender-msd-musicnn
⬇️ gender-openl3-music-mel128-emb512

## Timbre
Classification of music by timbre color (2 classes):
```
bright, dark
```
Models:

⬇️ timbre-discogs-effnet

## Nsynth acoustic/electronic
Classification of monophonic sources into acoustic or electronic origin using the Nsynth dataset (2 classes):
```
acoustic, electronic
```
Models:

⬇️ nsynth_acoustic_electronic-discogs-effnet

## Nsynth bright/dark
Classification of monophonic sources by timbre color using the Nsynth dataset (2 classes):
```
bright, dark
```
Models:

⬇️ nsynth_bright_dark-discogs-effnet

## Nsynth instrument
Classification of monophonic sources by instrument family using the Nsynth dataset (11 classes):
```
mallet, string, reed, guitar, synth_lead, vocal, bass, flute, keyboard, brass, organ
```
Models:

⬇️ nsynth_instrument-discogs-effnet

## Nsynth reverb
Detection of reverb in monophonic sources using the Nsynth dataset (2 classes):
```
dry, wet
```
Models:

⬇️ nsynth_reverb-discogs-effnet

# Tonality
## Tonal/atonal
Music classification by tonality (2 classes):
```
atonal, tonal
```
Models:

⬇️ tonal_atonal-audioset-vggish
⬇️ tonal_atonal-audioset-yamnet
⬇️ tonal_atonal-discogs-effnet
⬇️ tonal_atonal-msd-musicnn
⬇️ tonal_atonal-openl3-music-mel128-emb512

# Miscellaneous tags
## MTG-Jamendo top50tags
Music automatic tagging using the top-50 tags of the MTG-Jamendo Dataset:
```
alternative, ambient, atmospheric, chillout, classical, dance, downtempo, easylistening, electronic, experimental, folk,
funk, hiphop, house, indie, instrumentalpop, jazz, lounge, metal, newage, orchestral, pop, popfolk, poprock, reggae, rock,
soundtrack, techno, trance, triphop, world, acousticguitar, bass, computer, drummachine, drums, electricguitar,
electricpiano, guitar, keyboard, piano, strings, synthesizer, violin, voice, emotional, energetic, film, happy, relaxing
```
Models:

⬇️ mtg_jamendo_top50tags-discogs-effnet
⬇️ mtg_jamendo_top50tags-discogs_label_embeddings-effnet
⬇️ mtg_jamendo_top50tags-discogs_multi_embeddings-effnet
⬇️ mtg_jamendo_top50tags-discogs_release_embeddings-effnet
⬇️ mtg_jamendo_top50tags-discogs_track_embeddings-effnet
## MagnaTagATune
Music automatic tagging with the top-50 tags of the MagnaTagATune dataset:
```
ambient, beat, beats, cello, choir, choral, classic, classical, country, dance, drums, electronic, fast, female, female
vocal, female voice, flute, guitar, harp, harpsichord, indian, loud, male, male vocal, male voice, man, metal, new age, no
vocal, no vocals, no voice, opera, piano, pop, quiet, rock, singing, sitar, slow, soft, solo, strings, synth, techno,
violin, vocal, vocals, voice, weird, woman
```
Models:

⬇️ mtt-discogs-effnet
⬇️ mtt-discogs_artist_embeddings-effnet
⬇️ mtt-discogs_label_embeddings-effnet
⬇️ mtt-discogs_multi_embeddings-effnet
⬇️ mtt-discogs_release_embeddings-effnet
⬇️ mtt-discogs_track_embeddings-effnet

## Million Song Dataset
Music automatic tagging using the top-50 tags of the LastFM/Million Song Dataset:
```
rock, pop, alternative, indie, electronic, female vocalists, dance, 00s, alternative rock, jazz, beautiful, metal,
chillout, male vocalists, classic rock, soul, indie rock, Mellow, electronica, 80s, folk, 90s, chill, instrumental, punk,
oldies, blues, hard rock, ambient, acoustic, experimental, female vocalist, guitar, Hip-Hop, 70s, party, country, easy
listening, sexy, catchy, funk, electro, heavy metal, Progressive rock, 60s, rnb, indie pop, sad, House, happy
```
Models:

⬇️ msd-msd-musicnn