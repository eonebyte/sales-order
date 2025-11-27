import React, { useState } from "react";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { motion } from "framer-motion";

const { Title } = Typography;

export default function LoginPage() {
    const [loading, setLoading] = useState(false);

    const onFinish = async (values) => {

        //testing payload login
        // console.log('values : ', values);

        try {
            setLoading(true);

            const response = await fetch("https://api.adyawinsa.com/api/sales-order/login.php", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": "a317649531f727dae75384908a326b56",
                },
                body: JSON.stringify(values),
            });

            const result = await response.json();

            console.log('res login : ', response);
            console.log('result login : ', result);

            if (!result.status) {
                message.error(result.message || "Login failed");
                setLoading(false);
                return;
            } else {
                sessionStorage.setItem("access_token", result.token);
                sessionStorage.setItem("user", JSON.stringify(result.user));
                message.success("Login berhasil!");
                setLoading(false);
            }

        } catch (err) {
            console.log(err);

            message.error("Terjadi kesalahan koneksi");
            setLoading(false);
        } finally {
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    };

    return (
        <div
            style={{
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f0f2f5",
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <Card
                    style={{
                        width: 380,
                        borderRadius: "16px",
                        padding: "10px 5px",
                        boxShadow:
                            "0 8px 25px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.05)",
                    }}
                >
                    <div style={{ textAlign: "center", marginBottom: 25 }}>
                        <Title level={3} style={{ margin: 0 }}>
                            Login
                        </Title>
                        <span style={{ color: "#888" }}>
                            Masukkan username dan password Anda
                        </span>
                    </div>

                    <Form layout="vertical" onFinish={onFinish}>
                        <Form.Item
                            label="Username"
                            name="username"
                            rules={[
                                { required: true, message: "Username tidak boleh kosong" },
                            ]}
                        >
                            <Input
                                size="large"
                                prefix={<UserOutlined />}
                                placeholder="Username"
                            />
                        </Form.Item>

                        <Form.Item
                            label="Password"
                            name="password"
                            rules={[
                                { required: true, message: "Password tidak boleh kosong" },
                            ]}
                        >
                            <Input.Password
                                size="large"
                                prefix={<LockOutlined />}
                                placeholder="Password"
                            />
                        </Form.Item>

                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            block
                            loading={loading}
                            style={{
                                borderRadius: "8px",
                                marginTop: "10px",
                            }}
                        >
                            Login
                        </Button>
                    </Form>
                </Card>
            </motion.div>
        </div>
    );
}
