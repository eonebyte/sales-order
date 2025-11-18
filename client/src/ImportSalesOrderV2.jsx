import React, { useState } from "react";
import '@ant-design/v5-patch-for-react-19';
import {
  Upload,
  Table,
  Card,
  Button,
  message,
  Typography,
  Modal,
  Alert,
  List,
  Space,
  Row,
  Col,
  notification,
} from "antd";
import {
  UploadOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { read, utils, writeFile } from "xlsx";

import dayjs from 'dayjs';
import LoginPage from "./Login";
const { Title } = Typography;
const { confirm } = Modal;
// ===================================================================
// PENTING: Sesuaikan URL ini dengan alamat server PHP Anda
// ===================================================================
const VALIDATION_API_URL = "http://api-node.adyawinsa.com:3001/api/validate-sales-order"; // Ganti jika port atau nama file berbeda


export default function ImportSalesOrderV2() {
  const token = localStorage.getItem("access_token");
  const isLoggedIn =
    token &&
    token !== "null" &&
    token !== "undefined" &&
    token.trim().length > 3;





  const [api, contextHolder] = notification.useNotification();
  const openNotificationWithIcon = (type, msg) => {
    api[type]({
      message: type.toUpperCase(),
      description: msg,
      duration: 6
    });
  };


  // ==
  const [displayHeaders, setDisplayHeaders] = useState([]);
  const [displayLines, setDisplayLines] = useState([]);
  const [dataForSubmit, setDataForSubmit] = useState([]);
  const [headerColumns, setHeaderColumns] = useState([]);
  const [lineColumns, setLineColumns] = useState([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messageApi, msgApiContext] = message.useMessage();

  // ===================================================================
  // STATE BARU: Untuk menampung error validasi dari backend
  // ===================================================================
  const [validationErrors, setValidationErrors] = useState([]);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);

  // Fungsi untuk mereset semua state data saat upload baru atau kembali
  const resetState = () => {
    setDisplayHeaders([]);
    setDisplayLines([]);
    setDataForSubmit([]);
    setHeaderColumns([]);
    setLineColumns([]);
    setExpandedRowKeys([]);
    setShowPreview(false);
    setValidationErrors([]);
  };

  const formatKeyToSnakeCase = (key) => {
    if (typeof key !== 'string') return key;
    return key.trim().toLowerCase().replace(/\s+/g, '_');
  };

  const handleFile = async (file) => {
    setLoading(true);
    resetState(); // Selalu reset state di awal

    let parsedDataForSubmit;

    // --- TAHAP 1: PARSE FILE EXCEL MENJADI JSON (DI FRONTEND) ---
    try {
      const data = await file.arrayBuffer();
      const workbook = read(data, { type: "array", cellDates: true });

      const allOrdersForSubmit = [];
      const sheetsToProcess = workbook.SheetNames.slice(0, -1);

      // ===================================================================
      const dateColumnNames = new Set([
        'date ordered',
        'date promised',
        'po date',
        'date request'
      ]);

      const cleanAndFormatValue = (value, columnName) => {
        let processedValue = value;

        // Langkah 1: Selalu bersihkan spasi jika nilainya adalah string
        if (typeof processedValue === 'string') {
          processedValue = processedValue.trim();
        }

        const lowerColumnName = columnName.toLowerCase();

        // Langkah 2: Lakukan format spesifik berdasarkan nama kolom
        if (lowerColumnName === 'sales period') {
          return dayjs(processedValue).format('MMM-YY');
        }

        if (dateColumnNames.has(lowerColumnName)) {
          const dateObj = dayjs(processedValue);
          if (dateObj.isValid()) {
            return dateObj.format('YYYY-MM-DD');
          }
        }

        // Jika tidak ada format khusus, kembalikan nilai yang sudah di-trim
        return processedValue;
      };

      sheetsToProcess.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const dataAsArray = utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (dataAsArray.length < 4) {
          console.warn(`ORDER"${sheetName}" diabaikan karena format tidak benar.`);
          return;
        }

        const headerKeys = dataAsArray[0];
        const headerValues = dataAsArray[1];
        const headerData = {};
        headerKeys.forEach((key, i) => {
          if (key && String(key).trim() !== "" && !String(key).startsWith('__EMPTY')) {
            const cleanKey = String(key).trim();
            headerData[cleanKey] = cleanAndFormatValue(headerValues[i], cleanKey);
          }
        });

        const lineJson = utils.sheet_to_json(sheet, { range: 2, defval: "" });
        const lineList = lineJson.map(row => {
          const cleanedRow = {};
          Object.entries(row).forEach(([key, value]) => {
            const cleanKey = String(key).trim();
            if (cleanKey && !cleanKey.startsWith('__EMPTY')) {
              cleanedRow[cleanKey] = cleanAndFormatValue(value, cleanKey);
            }
          });
          return cleanedRow;
        }).filter(line => Object.keys(line).length > 0);

        allOrdersForSubmit.push({
          headers: [headerData],
          lines: lineList,
        });
      });

      if (allOrdersForSubmit.length === 0) {
        throw new Error("Tidak ada data valid yang ditemukan di file Excel.");
      }

      parsedDataForSubmit = allOrdersForSubmit;

    } catch (err) {
      console.error(err);
      messageApi.error(err.message || "Gagal membaca atau memproses file Excel!");
      setLoading(false);
      return false; // Hentikan eksekusi jika parsing gagal
    }

    // --- TAHAP 2: KIRIM JSON KE BACKEND PHP UNTUK VALIDASI ---
    try {

      const dataForBackend = parsedDataForSubmit.map(order => ({
        header: Object.fromEntries(
          Object.entries(order.headers[0]).map(([key, value]) => [
            formatKeyToSnakeCase(key),
            value
          ])
        ),
        lines: order.lines.map(line =>
          Object.fromEntries(
            Object.entries(line).map(([key, value]) => [formatKeyToSnakeCase(key), value])
          )
        )
      }));


      const response = await fetch(VALIDATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataForBackend)
      });

      const result = await response.json();

      const enrichedDataFromBackend = result.data;

      // Jika respons status BUKAN OK (misal: 400), berarti ada error validasi
      if (!response.ok) {
        if (result.errors) {
          // Simpan error ke state dan tampilkan modal
          setValidationErrors(result.errors);
          setIsErrorModalVisible(true);
        } else {
          // Error tak terduga dari server
          throw new Error(result.message || 'Terjadi kesalahan validasi di server.');
        }
        // Hentikan proses, JANGAN tampilkan preview jika ada error
        setLoading(false);
        return false;
      }

      // --- TAHAP 3: JIKA VALIDASI SUKSES, PROSES DATA UNTUK DITAMPILKAN DI PREVIEW ---
      messageApi.success("Validasi berhasil! Data siap untuk diimport.");

      const allDisplayHeaders = [];
      const allDisplayLines = [];

      parsedDataForSubmit.forEach((order, index) => {
        const parentKey = `sheet-${index}`;
        allDisplayHeaders.push({
          key: parentKey,
          ...order.headers[0],
        });

        order.lines.forEach((line, lineIndex) => {
          allDisplayLines.push({
            key: `${parentKey}-line-${lineIndex}`,
            parentKey: parentKey,
            ...line,
          });
        });
      });

      const firstOrder = allDisplayHeaders[0];

      const hColumns = Object.keys(firstOrder)
        .filter(key => key !== 'key')
        .map(key => ({ title: key, dataIndex: key, key }));

      let lColumns = allDisplayLines.length > 0
        ? Object.keys(allDisplayLines[0])
          .filter(key => key !== 'key' && key !== 'parentKey')
          .map(key => ({ title: key, dataIndex: key, key }))
        : [];

      const dateOrderedHeader = formatKeyToSnakeCase(firstOrder["Date Ordered"])

      lColumns.unshift({
        title: "Date Ordered",
        dataIndex: "date_ordered",
        key: "date_ordered",
        render: () => dateOrderedHeader
      })


      hColumns.unshift({
        title: 'No.',
        key: 'no',
        width: 60,
        align: 'center',
        render: (text, record, index) => index + 1,
      });

      setDisplayHeaders(allDisplayHeaders);
      setDisplayLines(allDisplayLines);
      setDataForSubmit(enrichedDataFromBackend);
      setHeaderColumns(hColumns);
      setLineColumns(lColumns);
      setExpandedRowKeys(allDisplayHeaders.map(h => h.key));
      setShowPreview(true); // Tampilkan preview karena data sudah valid

    } catch (err) {
      console.error("Error saat validasi:", err);
      messageApi.error(err.message || "Tidak dapat terhubung ke server validasi. Pastikan server PHP berjalan.");
    } finally {
      setLoading(false);
    }

    // Selalu return false untuk mencegah upload otomatis dari komponen Ant Design
    return false;
  };

  const handleSubmit = async () => {

    // console.log(JSON.stringify(dataForSubmit, null, 2));
    try {
      const response = await fetch("https://api.adyawinsa.com/api/sales-order/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "a317649531f727dae75384908a326b56",
          "Authorization": `Bearer ${localStorage.getItem("access_token")}`
        },
        body: JSON.stringify(dataForSubmit),
      });

      // Validasi HTTP status
      if (!response.ok) {
        const errorText = await response.text(); // baca pesan server
        openNotificationWithIcon('error', `Gagal mengirim data: ${errorText}`)
        throw new Error(`Request failed (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();
      responseData.forEach(order => {
        openNotificationWithIcon(
          'success',
          <span>
            Order : <strong>{order.documentno}</strong> created successfully
          </span>
        );
      })

      // -------------------------------------
      // ✅ EXPORT EXCEL
      // -------------------------------------
      const exportRows = responseData.map(order => ({
        "Document No": order.documentno,
        "Total Lines": order.total_lines,
        "TaxBase / DPP": order.tax_base,
        "Tax Amt ": order.tax_amount,
        "Grand Total ": order.grand_total,
        Status: "Created",
        "Created At": new Date().toISOString(),
      }));

      const worksheet = utils.json_to_sheet(exportRows);
      const workbook = { SheetNames: ["Orders"], Sheets: { Orders: worksheet } };

      writeFile(workbook, `sales_order_${Date.now()}.xlsx`);

      // Reset State
      setDisplayHeaders([]);
      setDisplayLines([]);
      setDataForSubmit([]);
      setHeaderColumns([]);
      setLineColumns([]);
      setExpandedRowKeys([]);
      setShowPreview(false);
      setValidationErrors([]);
    } catch (error) {
      console.error("Error:", error);
      openNotificationWithIcon('error', `Gagal mengirim data: ${error.message}`)

    }

  };

  const expandedRowRender = (record) => {
    const childLines = displayLines.filter(line => line.parentKey === record.key);
    const lineColumnsWithSpacers = [
      { key: 'spacer-expand', width: 60 },
      { key: 'spacer-no', width: 60 },
      ...lineColumns,
    ];
    return <Table bordered columns={lineColumnsWithSpacers} dataSource={childLines} rowKey="key" size="small" pagination={false} />;
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    window.location.reload(); // paksa reload agar kembali ke LoginPage
  };


  return (
    <>
      {isLoggedIn ? (
        <div>
          <div style={{
            position: "absolute",
            top: 20,
            right: 20
          }}>
            <Button danger onClick={handleLogout}>
              Logout
            </Button>
          </div>

          {msgApiContext}
          {contextHolder}

          {/* ================================================================ */}
          {/* MODAL BARU: Untuk Menampilkan Error Validasi dari Backend        */}
          {/* ================================================================ */}
          <Modal
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: 'red' }} />
                Error Validasi Data
              </Space>
            }
            open={isErrorModalVisible}
            onOk={() => setIsErrorModalVisible(false)}
            onCancel={() => setIsErrorModalVisible(false)}
            footer={[
              <Button key="back" type="primary" onClick={() => setIsErrorModalVisible(false)}>
                Mengerti
              </Button>,
            ]}
            width={700}
          >
            <Alert
              message="Silakan perbaiki kesalahan berikut di file Excel Anda dan coba unggah kembali."
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <List
              style={{ maxHeight: '40vh', overflowY: 'auto' }}
              bordered
              dataSource={validationErrors}
              renderItem={(item, index) => {
                let errorTitle = `ORDER${item.sheetIndex + 1}`;

                if (item.type === 'header') {
                  // Jika error ada di header
                  errorTitle += `, Header (Col: ${item.field})`;
                } else if (item.type === 'line') {
                  // Jika error ada di baris data
                  errorTitle += `, Line ${(item.index + 1) * 10} (Col: ${item.field})`;
                } else {
                  // Fallback jika tipe tidak terdefinisi
                  errorTitle += ` (Col: ${item.field})`;
                }

                return (
                  <List.Item key={index}>
                    <List.Item.Meta
                      title={errorTitle}
                      description={item.message}
                    />
                  </List.Item>
                )
              }
              }
            />
          </Modal>

          {!showPreview ? (
            <Row justify="center" align="middle" style={{ minHeight: '60vh' }}>
              <Col span={12} style={{ textAlign: 'center' }}>
                <Card title={<Title level={4}>Import Sales Order</Title>}>
                  <Upload.Dragger accept=".xls,.xlsx" beforeUpload={handleFile} showUploadList={false} disabled={loading}>
                    <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                    <p className="ant-upload-text">Klik atau seret file ke area ini</p>
                  </Upload.Dragger>
                  <Button
                    type="primary"
                    onClick={() => document.querySelector('.ant-upload-btn input')?.click()}
                    loading={loading}
                    style={{ marginTop: 16, width: '100%' }}
                  >
                    {loading ? "Memproses & Validasi..." : "Pilih File & Validasi"}
                  </Button>
                </Card>
              </Col>
            </Row>
          ) : (
            <Card
              title={<Button icon={<ArrowLeftOutlined />} onClick={() => { resetState(); }} />}
              variant="borderless"
              extra={
                <Button type="primary" icon={<SendOutlined />} onClick={() => confirm({ title: "Kirim data?", onOk: handleSubmit })}>
                  Submit
                </Button>
              }
            >
              <Table
                size="small"
                columns={headerColumns}
                dataSource={displayHeaders}
                rowKey="key"
                pagination={false}
                scroll={{ x: "max-content" }}
                expandable={{
                  expandedRowRender,
                  rowExpandable: record => displayLines.some(line => line.parentKey === record.key),
                  expandedRowKeys: expandedRowKeys,
                  onExpandedRowsChange: (keys) => setExpandedRowKeys(keys),
                }}
                rowClassName={() => 'order-header-row'}
              />
              <style>{`
            .order-header-row > td { background-color: #d9d9d9 !important; font-weight: 500; }
            .order-header-row .ant-table-expanded-row > .ant-table-cell { padding: 0 !important; }
            .order-header-row .ant-table-expanded-row .ant-table { margin: 0; }
            .ant-table-expanded-row .ant-table-thead > tr > th:nth-child(1),
            .ant-table-expanded-row .ant-table-thead > tr > th:nth-child(2) { border: none; background: white !important; }
          `}</style>
            </Card>
          )}
        </div>
      ) : (
        <LoginPage />
      )}
    </>

  );
}