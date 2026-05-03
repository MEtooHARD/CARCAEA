# 更新 /extractor_server 的路由時，請確保回頭更新 /extractor_server/routes.py 中的路由匯入和 __all__ 列表，以保持一致性。以及 /server/types/audio-extractor-api.ts 中的 API 定義。

# about this project
This is an academic project, also my undergraduate project.
The main goal of this project is to measure user's hrv (heart rate variability) and recommend appropriate music based on the user's current state and the goal state (states are described directly by hrv).
For this codebase, this is the project's main backend. It holds a set of jamendo audio files (about 50k mp3 files). It's also responsive for extracting audio features from the audio files and storing them in a postgres database. It also provides an API for the frontend to query the database and get the recommended music list.
The proposed recommendation strategy is:
1. Get the user's current hrv state and the goal hrv state. (this will be attached to the request from the frontend)
2. 1st stage: combine many strategies, such as database-wide random picking, picking songs with potential proper for the goal state, etc. and form a candidate list of songs.
3. 2nd stage: calculate the distance between each candidate song's predicted hrv change end-point to the current user (based on the user's baseline, current state, the song's features) and the user's current hrv state, and sort the candidate list based on the distance. Then return the sorted candidate list to the frontend.
So, instead of directly predict whether a song is approprete or a song's leading hrv, the model only predicts: for that certain user, under that certain condition, witha given certain song, what is the hrv change to the user. Then the system take this result to sort based on the distance between {user's current state + predicted change} and the {goal state}.

## more academic details
It is proposed that we track user's hrv by units of songs. In practice, everything is evaluated by a song's time and the mean of status during that session of time. More practically, for a prediction case, the audio features are the song's feature envelope means, except the thumbnail features, those are measured specifically for just the thumbnail part. Same as the hrv, the hrv featues are the mean during the user is listening to the song.


# about the codebase
- For the main api server, e.g. /server, several universal tools are under /server/utils and /server/types, most are pure functions and math tools. One should leverage them, extend them if needed. Instead of writing duplicated or similar functions. The Result pattern is specifically prefered.

- snake style for function and variable names are preferred. Especially tiny utility ones.