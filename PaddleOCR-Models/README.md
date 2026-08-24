# Bộ Model PaddleOCR Chính Hãng (PP-OCRv4 & PP-OCRv3)

Thư mục này chứa đầy đủ các model OCR chính thức từ kho lưu trữ [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR):

## 1. Cấu Trúc Model
- **`paddle_inference/`**:
  - `ch_PP-OCRv4_det_infer/`: Model phát hiện vùng chữ (Detection) siêu nhẹ bản v4.
  - `ch_PP-OCRv3_det_infer/`: Model phát hiện vùng chữ (Detection) bản v3.
  - `ch_PP-OCRv4_rec_infer/`: Model nhận diện ký tự (Recognition) đa ngôn ngữ v4.
  - `latin_PP-OCRv3_rec_infer/`: Model nhận diện ký tự Latin/Tiếng Việt tối ưu độ chính xác.
  - `ch_ppocr_mobile_v2.0_cls_infer/`: Model phân loại góc xoay ảnh (Angle Classifier).
- **`onnx/`**:
  - `ch_PP-OCRv4_rec.onnx`: Model ONNX nhận diện đa ngôn ngữ.
  - `latin_PP-OCRv3_rec.onnx`: Model ONNX nhận diện chữ Latin/Tiếng Việt cho Web ONNX.
  - `ch_ppocr_mobile_v2.0_cls.onnx`: Model ONNX phân loại góc xoay.
- **`dictionaries/`**:
  - `ppocr_keys_v1.txt`: Từ điển ký tự chuẩn PaddleOCR.
  - `latin_dict.txt`: Từ điển ký tự Latin & Tiếng Việt có dấu đầy đủ.
  - `en_dict.txt`: Từ điển ký tự tiếng Anh.

## 2. Cách Sử Dụng Với Python PaddleOCR
```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(
    use_angle_cls=True,
    det_model_dir="./paddle_inference/ch_PP-OCRv4_det_infer",
    rec_model_dir="./paddle_inference/latin_PP-OCRv3_rec_infer",
    cls_model_dir="./paddle_inference/ch_ppocr_mobile_v2.0_cls_infer",
    rec_char_dict_path="./dictionaries/latin_dict.txt",
    use_gpu=False
)

result = ocr.ocr("image.png", cls=True)
for line in result[0]:
    print(line[1][0], line[1][1])
```
