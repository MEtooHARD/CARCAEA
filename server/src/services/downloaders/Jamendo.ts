

interface JamendoEntityBase {
    id: string
}

interface JamendoTrack extends JamendoEntityBase {
    name: string
    duration: number
    artist_id: string
    artist_name: string
    artist_idstr: string
    album_name: string
    album_id: string
    license_ccurl: string
    position: number
    releasedate: string
    album_image: string
    audio: string
    audiodownload: string
    prourl: string
    shorturl: string
    shareurl: string
    waveform: string
    image: string
    musicinfo: {
        vocalinstrumental: string
        lang: string
        gender: string
        acousticelectric: string
        speed: string
        tags: {
            genres: string[]
            instruments: string[]
            vartags: string[]
        }
    },
    audiodownload_allowed: boolean,
    content_id_free: boolean
}