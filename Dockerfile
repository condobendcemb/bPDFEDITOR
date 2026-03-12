FROM node:20-alpine

# ติดตั้ง fontconfig เผื่อไว้สำหรับการจัดการฟอนต์ในระบบ (ถ้าจำเป็น)
RUN apk add --no-cache fontconfig

WORKDIR /app

# 1. Copy package files และติดตั้ง dependencies
COPY package*.json ./
# หากคุณติดตั้ง @pdf-lib/fontkit เพิ่มแล้ว มันจะถูกลงที่นี่
RUN npm install

# 2. Copy ไฟล์ทั้งหมดในโปรเจกต์
COPY . .

# ⚠️ สำคัญ: ตรวจสอบให้แน่ใจว่าไฟล์ .ttf ของคุณอยู่ที่โฟลเดอร์ public/
# เช่น ./public/THSarabunNew.ttf

EXPOSE 3000

# รันแอปโดยระบุพอร์ต 3000 ให้ตรงกับที่ Log แจ้ง
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]