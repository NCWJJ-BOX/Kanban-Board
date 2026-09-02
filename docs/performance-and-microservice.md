Performance & Microservice Architecture

ระบบนี้พัฒนาด้วย Python 3, Django 5 และ Django REST Framework โดยเลือกใช้ Django เนื่องจากมี ORM, Admin และระบบ Authentication ที่พร้อมใช้งาน รวมถึงสามารถจัดการเรื่องประสิทธิภาพของ Database Query ได้ค่อนข้างดี เช่น select_related และ prefetch_related ส่วนฐานข้อมูลเลือกใช้ PostgreSQL 16 ซึ่งรองรับ Foreign Key, Transaction, Index และสามารถใช้งาน JSONB ได้ในกรณีที่จำเป็น

ฝั่ง Frontend พัฒนาด้วย React 18 และ Vite โดย Backend ทำหน้าที่เป็น REST API ที่ส่งข้อมูลในรูปแบบ JSON ส่วนระบบทั้งหมดสามารถรันผ่าน Docker Compose โดยแบ่งเป็น Database, Backend, Frontend และ pgAdmin สำหรับจัดการฐานข้อมูล ปัจจุบันระบบ Notification ใช้วิธี Polling ทุก 5 วินาที

การออกแบบด้าน Performance ที่ทำไว้แล้ว

ในส่วนของการจัดการ Task ได้ใช้แนวคิด Fractional Indexing สำหรับค่า position ทำให้เวลาผู้ใช้ลาก Task ไปยังตำแหน่งใหม่ ระบบไม่จำเป็นต้อง Update Task ทุกตัวที่อยู่ถัดไป แต่สามารถคำนวณค่าที่อยู่ระหว่างตำแหน่งก่อนหน้าและตำแหน่งถัดไป แล้ว Update เพียง Task ที่ถูกย้ายเท่านั้น ส่งผลให้จำนวน Database Write ลดลงจากการ Update หลายแถวเหลือเพียงประมาณ 1 แถวต่อการย้าย Task

นอกจากนี้ยังมีการจัดการปัญหา N+1 Query ในหลายส่วนของระบบ โดยใช้ select_related และ prefetch_related เพื่อดึงข้อมูลที่เกี่ยวข้องมาพร้อมกัน เช่น ข้อมูล Assignee, Tag, Column และ User ทำให้ไม่ต้องยิง Query ซ้ำทุกครั้งที่ Serializer ต้องการข้อมูลของ Object ที่เกี่ยวข้อง

สำหรับการลบ Board ระบบไม่ได้ลบข้อมูลออกจาก Database โดยตรง แต่ใช้ Soft Delete ผ่าน deleted_at ซึ่งช่วยป้องกันการเกิด Cascade Delete จำนวนมาก และยังสามารถเก็บข้อมูลเดิมไว้สำหรับการตรวจสอบย้อนหลังหรือทำ Audit ได้

ส่วน Notification มีการจำกัดจำนวนข้อมูลที่ส่งกลับในแต่ละครั้งไว้ที่ 50 รายการ เพื่อป้องกันไม่ให้ Response มีขนาดใหญ่ขึ้นเรื่อย ๆ และทุก Query ที่เกี่ยวข้องกับข้อมูลของผู้ใช้จะเริ่มจาก request.user ทำให้สามารถจำกัดขอบเขตข้อมูลตั้งแต่ระดับ Database และช่วยเรื่อง Data Isolation ไปพร้อมกัน

แนวทางเพิ่ม Performance ในอนาคต

ในระยะต่อไปสามารถเพิ่ม Database Index ในจุดที่มีการ Query บ่อย เช่น tasks ที่มีการค้นหาตาม column_id และเรียงตาม position รวมถึง columns ที่ค้นหาตาม board_id และเรียงตาม position นอกจากนี้ยังสามารถเพิ่ม Index ให้กับ Notification และ Invitation เพื่อให้การ Filter และ Sort ทำงานได้เร็วขึ้น โดยการเพิ่ม Index สามารถทำผ่าน Django Migration โดยไม่จำเป็นต้องเปลี่ยน Business Logic หลักของระบบ

อีกจุดที่สามารถปรับปรุงได้คือ Board Detail ซึ่งเป็น Endpoint ที่มีข้อมูลซ้อนกันหลายระดับ เช่น Board → Column → Task → Assignee และ Tag หาก Board มีข้อมูลจำนวนมากอาจเกิด N+1 Query ได้ จึงสามารถใช้ prefetch_related เพื่อโหลดข้อมูลที่เกี่ยวข้องทั้งหมดล่วงหน้าได้

สำหรับหน้า Board List ปัจจุบันจำนวน Column และ Task อาจต้อง Query เพิ่มสำหรับแต่ละ Board ซึ่งเมื่อมี Board จำนวนมากจะทำให้เกิด Query เพิ่มขึ้นตามจำนวน Board จึงสามารถแก้ไขโดยใช้ Django Count Annotation เพื่อให้ Database คำนวณจำนวน Column และ Task ใน Query เดียว

ระบบ Notification ในปัจจุบันใช้ Polling ทุก 5 วินาที ซึ่งแม้จะรองรับการใช้งานได้ แต่มีข้อจำกัดด้าน Latency และเกิด Request ซ้ำอย่างต่อเนื่อง ในอนาคตจึงสามารถเปลี่ยนเป็น WebSocket ด้วย Django Channels และ Redis Channel Layer เพื่อให้ Server ส่ง Notification ไปยัง Client ทันทีเมื่อเกิด Event เช่น การ Assign Task หรือการเชิญผู้ใช้เข้าร่วม Board โดยยังสามารถเก็บ Polling ไว้เป็น Fallback สำหรับกรณีที่ Client กลับมาจากสถานะ Suspend และต้องการตรวจสอบ Notification ที่อาจพลาดไป

อีกแนวทางหนึ่งคือการใช้ Redis ทำ Cache สำหรับข้อมูล Board Detail โดยใช้รูปแบบ Cache-Aside เมื่อมีการอ่านข้อมูล ระบบจะตรวจสอบ Cache ก่อน หากไม่มีข้อมูลจึง Query จาก Database แล้วนำผลลัพธ์ไปเก็บใน Redis ส่วนเมื่อมีการแก้ไขข้อมูลที่เกี่ยวข้องก็สามารถ Invalidate Cache เพื่อให้ข้อมูลที่อ่านครั้งต่อไปเป็นข้อมูลล่าสุด

สำหรับ Endpoint ที่มีข้อมูลเพิ่มขึ้นเรื่อย ๆ เช่น Notification สามารถเปลี่ยนจากการใช้ Pagination แบบ Page Number เป็น Cursor Pagination ซึ่งเหมาะกับข้อมูลที่มีการเพิ่มใหม่อยู่ตลอด เพราะสามารถรักษาตำแหน่งของข้อมูลได้ดีกว่าในกรณีที่มี Record ใหม่แทรกเข้ามาระหว่างที่ผู้ใช้กำลังเปิดดูข้อมูล

ในด้าน Production สามารถตั้งค่า CONN_MAX_AGE เพื่อให้ Database Connection ถูกนำกลับมาใช้ซ้ำ ลด Connection Churn และเมื่อระบบมีหลาย Backend Instance สามารถเพิ่ม PgBouncer เพื่อช่วยบริหาร Connection ของ PostgreSQL ส่วน Django Development Server ควรเปลี่ยนเป็น Gunicorn สำหรับ Production

สำหรับงานที่ไม่จำเป็นต้องทำให้เสร็จก่อนส่ง Response เช่น การส่ง Notification หรือการประมวลผลบางอย่างหลังจากมีการลาก Task สามารถย้ายไปทำเป็น Background Job ด้วย Celery หรือระบบ Queue อื่น ๆ เพื่อให้ API สามารถตอบกลับผู้ใช้ได้เร็วขึ้น
