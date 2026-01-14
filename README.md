# Audio feature extraction using Essentia TensorFlow models
# Models from: https://essentia.upf.edu/models.html
# Citation (please include in any publication or report):
# 
# @inproceedings{alonso2020tensorflow,
#   title={Tensorflow Audio Models in {Essentia}},
#   author={Alonso-Jim{\'e}nez, Pablo and Bogdanov, Dmitry and Pons, Jordi and Serra, Xavier},
#   booktitle={International Conference on Acoustics, Speech and Signal Processing (ICASSP)},
#   year={2020},
#   doi={10.1109/ICASSP40776.2020.9054688}
# }
#
# License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
# https://creativecommons.org/licenses/by-nc-sa/4.0/


# Necessities  
## 1. [Essentia Tensorflow Models](https://essentia.upf.edu/models.html) weights  

> ### 1. Find the following subjects and download their weights and metadata:  
> **Extractors:**  
> - discogs-effnet-bs64  
> - msd-musicnn  
> - discogs-meast-30s-pw-ts  
> 
> **Classifiers:**  
> - genre_discogs400-discogs-maest-30s-pw-ts  
> - emomusic-msd-musicnn  
> 
> ### 2. Put the weights under ./essentia/weights
> ### 3. Put the metadata under ./server/medatada
