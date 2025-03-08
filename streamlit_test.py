"""
加载img/dog.jpg, 在streamlit上展示网页，将其设置为streamlit_drawable_canvas 的背景图片
支持手涂、框选两种模式
"""
import streamlit as st
import cv2
import numpy as np
from PIL import Image
import io
import streamlit_drawable_canvas as sdc

# Add a dropdown in the sidebar to select the drawing mode
drawing_mode = st.sidebar.selectbox(
    "Select Drawing Mode",
    ("freedraw", "rect", "eraser", "line", "circle", "point", "polygon"),
)

# Add eraser mode toggle
eraser_mode = st.sidebar.toggle("Eraser Mode", False)

# Set colors based on eraser mode
if not eraser_mode:
    fill_color = "rgba(128, 255, 255, 1)"  # 完全不透明的白色
    stroke_color = "rgba(128, 255, 255, 1)"
else:
    fill_color = "rgba(255, 255, 255, 0.0)"  # 半透明的橙色
    stroke_color = "rgba(255, 255, 255, 0.0)"

img = Image.open('img/dog.jpg')

c1, c2 = st.columns(2)
with c1:
    canvas = sdc.st_canvas(
        fill_color=fill_color,
        stroke_width=10,
        stroke_color=stroke_color,
        background_image=img,
        update_streamlit=True,
        height=600,
        width=600,
        drawing_mode=drawing_mode,
        key="canvas1",
    )

# 提取canvas的A通道，并二值化为0/255
if canvas.image_data is not None:
    mask = canvas.image_data[:, :, 3]
else:
    mask = np.zeros((600, 600), dtype=np.uint8)


# add red mask to image according to mask
img = cv2.imread('img/dog.jpg')
img = cv2.resize(img, (600, 600))
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
img[mask > 0, 2] = (img[mask > 0, 2] * 0.2 + 255 * 0.8).astype(np.uint8)

with c2:
    st.image(img)



