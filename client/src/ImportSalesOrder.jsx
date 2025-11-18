import React, { useState } from "react";
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
  Checkbox,
  Tooltip,
  Row,
  Col,
} from "antd";
import {
  UploadOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { read, utils } from "xlsx";
import { v4 as uuidv4 } from "uuid";

const { Title, Text } = Typography;
const { confirm } = Modal;

export default function ImportSalesOrder() {
  // --- STRUKTUR DATA BARU: Header dan Line terpisah ---
  const [headers, setHeaders] = useState([]);
  const [lines, setLines] = useState([]);

  const [headerColumns, setHeaderColumns] = useState([]);
  const [lineColumns, setLineColumns] = useState([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDataValid, setIsDataValid] = useState(true);
  const [errorList, setErrorList] = useState([]);
  const [messageApi, contextHolder] = message.useMessage();

  const handleFile = async (file) => {
    setLoading(true);
    let localErrorList = [];

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = utils.sheet_to_json(sheet, { defval: "" });

      const headerList = [];
      const lineList = [];
      let currentparentId = null; // Untuk melacak ID header saat ini

      json.forEach((row, index) => {
        if (row.DateOrdered instanceof Date) {
          row.DateOrdered = row.DateOrdered.toISOString().split("T")[0]; // format YYYY-MM-DD
        }
        if (row.DatePromised instanceof Date) {
          row.DatePromised = row.DatePromised.toISOString().split("T")[0];
        }

        const hasRequiredHeaderFields =
          row.DocType && row.DateOrdered && row.DatePromised && row.BPartner;

        const isHeaderRow = hasRequiredHeaderFields;

        const isLineRow = row['C_OrderLine>Line'] && String(row['C_OrderLine>Line']).trim() !== '';

        // Jika ini adalah baris header baru
        if (isHeaderRow) {
          const parentId = uuidv4();
          currentparentId = parentId; // Set ID header saat ini

          const headerRow = { key: parentId, parent_id: parentId };
          // Object.entries(row) untuk clean key
          Object.entries(row).forEach(([key, value]) => {
            // Hapus spasi di awal/akhir dan di tengah
            const cleanKey = key.replace(/\s+/g, '').trim();
            if (!key.toLowerCase().startsWith("c_orderline>")) {
              headerRow[cleanKey] = value;
            }
          });

          headerList.push(headerRow);
        }

        // Jika baris ini memiliki data line yang valid
        if (isLineRow) {
          if (!currentparentId) {
            localErrorList.push({ message: `Baris ${index + 2} berisi data line tetapi tidak ada header di atasnya. Diabaikan.` });
            return;
          }

          const lineRow = {
            key: uuidv4(),
            parent_id: currentparentId, // Relasikan ke header saat ini
          };

          Object.entries(row).forEach(([key, value]) => {
            if (key.toLowerCase().startsWith("c_orderline>")) {
              const cleanKey = key.replace(/^c_orderline>/i, "");

              // Jika value adalah Date, ubah menjadi string YYYY-MM-DD
              if (value instanceof Date) {
                lineRow[cleanKey] = value.toISOString().split("T")[0];
              } else {
                lineRow[cleanKey] = value;
              }
            }
          });

          lineList.push(lineRow);

          console.log('line row : ', lineRow);
        }

      });

      const headerKeys = new Set();
      headerList.forEach(h => Object.keys(h).forEach(k => k !== 'key' && headerKeys.add(k)));


      const allLineKeys = new Set();
      lineList.forEach(line => Object.keys(line).forEach(k => {
        if (k !== 'key') allLineKeys.add(k);
      }));

      // --- Susun urutan: prioritas dulu, lalu sisanya ---
      const priority = ['Line', 'parent_id'];
      const lineKeysOrdered = [];

      // tambahkan kolom prioritas jika ada
      priority.forEach(p => {
        if (allLineKeys.has(p)) {
          lineKeysOrdered.push(p);
          allLineKeys.delete(p);
        }
      });

      // tambahkan sisa kolom
      lineKeysOrdered.push(...allLineKeys);

      const renderUuid = (id) => {
        if (!id || typeof id !== 'string') return null;
        // Ambil 13 karakter pertama + "..."
        const truncatedId = `${id.substring(0, 13)}...`;
        return (
          <Tooltip title={id}>
            <span>{truncatedId}</span>
          </Tooltip>
        );
      };


      const hColumns = Array.from(headerKeys).map(key => ({
        title: key,
        dataIndex: key,
        key,
        render: key === 'parent_id' ? renderUuid : undefined
      }));



      console.log('h coloumn : ', hColumns);

      const lColumns = lineKeysOrdered.map(key => ({
        title: key,
        dataIndex: key,
        key,
        render: key === 'parent_id' ? (id => id ? <Tooltip title={id}>{id.substring(0, 13)}...</Tooltip> : null) : undefined
      }));

      hColumns.unshift({
        title: 'No.',
        key: 'no',
        align: 'center',
        render: (text, record, index) => index + 1,
      });

      const allKeysToExpand = headerList.map(h => h.key);

      setHeaders(headerList);
      setLines(lineList);
      setHeaderColumns(hColumns);
      setLineColumns(lColumns);
      setExpandedRowKeys(allKeysToExpand);
      setShowPreview(true);
      setErrorList(localErrorList);
      setIsDataValid(localErrorList.length === 0);
      messageApi.success("File berhasil diproses!");

    } catch (err) {
      console.error(err);
      messageApi.error("Gagal membaca atau memproses file Excel!");
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleSubmit = () => {
    // Saat submit, Anda bisa mengirim kedua array ini ke backend
    console.log("Headers to submit:", headers);
    console.log("Lines to submit:", lines);
    messageApi.success("Data siap dikirim! Cek konsol untuk melihat struktur datanya.");
  };

  // Fungsi render relasional: filter 'lines' berdasarkan 'parent_id' dari header
  const expandedRowRender = (record) => {
    const childLines = lines.filter(line => line.parent_id === record.parent_id);
    return (
      <Table
        bordered={true}
        style={{ marginLeft: 95 }}
        columns={lineColumns}
        dataSource={childLines}
        rowKey="key"
        size="small"
        pagination={false}
      />
    );
  };

  const handleExpandAllChange = (e) => {
    if (e.target.checked) {
      const allExpandableKeys = headers
        .filter(h => lines.some(line => line.parent_id === h.parent_id))
        .map(h => h.key);
      setExpandedRowKeys(allExpandableKeys);
    } else {
      setExpandedRowKeys([]);
    }
  };

  const totalExpandableRows = headers.filter(h => lines.some(line => line.parent_id === h.parent_id)).length;
  const isAllExpanded = totalExpandableRows > 0 && expandedRowKeys.length === totalExpandableRows;
  const isPartiallyExpanded = expandedRowKeys.length > 0 && expandedRowKeys.length < totalExpandableRows;

  const finalHeaderColumns = [
    {
      ...Table.EXPAND_COLUMN,
      title: (
        <Checkbox
          checked={isAllExpanded}
          indeterminate={isPartiallyExpanded}
          onChange={handleExpandAllChange}
          disabled={totalExpandableRows === 0}
        />
      ),
      onHeaderCell: () => ({
        className: 'expand-all-header-cell',
      }),
    },
    ...headerColumns,
  ];

  return (
    <div>
      {contextHolder}
      {!showPreview ? (
        <Row justify="center"
          align="middle"
          style={{ minHeight: '60vh' }}>
          <Col span={12} style={{ textAlign: 'center' }}>
            <Card title={<Title level={4}>Import Sales Order</Title>} /* ... */ >
              <Upload.Dragger accept=".xls,.xlsx" beforeUpload={handleFile} showUploadList={false} /* ... */ >
                <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                <p className="ant-upload-text">Klik atau seret file ke area ini</p>
              </Upload.Dragger>
              <Button type="primary" onClick={() => document.querySelector('.ant-upload-btn input').click()} loading={loading} style={{ marginTop: 16, width: '100%' }}>
                {loading ? "Memproses..." : "Pilih File & Pratinjau"}
              </Button>
            </Card>
          </Col>
        </Row>

      ) : (
        <Card
          title={
            <>
              <Button icon={<ArrowLeftOutlined />} onClick={() => { setShowPreview(false); }} />
            </>
          }
          bordered={false}
          extra={
            <Button type="primary" icon={<SendOutlined />} onClick={() => confirm({ title: "Kirim data?", onOk: handleSubmit })} disabled={!isDataValid} style={{ background: isDataValid ? "#52c41a" : undefined, borderColor: isDataValid ? "#52c41a" : undefined }}>
              Submit
            </Button>
          }
        >
          {errorList.length > 0 && (
            <Alert /* ... */ />
          )}
          <Table
            size="small"
            columns={finalHeaderColumns}
            dataSource={headers}
            rowKey="key"
            pagination={{ pageSize: 10 }}
            scroll={{ x: "max-content" }}
            expandable={{
              expandedRowRender,
              rowExpandable: record => lines.some(line => line.parent_id === record.parent_id), // Tombol expand hanya jika ada line yang cocok
              expandedRowKeys: expandedRowKeys,
              onExpandedRowsChange: (keys) => {
                setExpandedRowKeys(keys);
              },
            }}
            rowClassName={() => 'order-header-row'}
          />
          <style>{`
            .order-header-row > td { background-color: #d9d9d9  !important; font-weight: 500; }
            .order-header-row .ant-table-expanded-row > .ant-table-cell { padding: 0 !important; }
            .order-header-row .ant-table-expanded-row .ant-table { margin: 0; }

            .expand-all-header-cell > .ant-table-cell-content {
              display: flex;
              justify-content: center;
              align-items: center;
            }
          `}</style>
        </Card>
      )
      }
    </div >
  );
}