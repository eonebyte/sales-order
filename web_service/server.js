// server.js
import Fastify from 'fastify';
import cors from '@fastify/cors';

import oracleDB from "../web_service/configs/dbOracle.js";

const fastify = Fastify({ logger: true });

fastify.register(cors, {
    origin: '*', // Untuk development. Di produksi, ganti dengan domain frontend Anda.
});

// --- DATABASE SIMULASI ---
const validProducts = [
    { value: 'Product1', m_product_id: 3000001 },
    { value: 'Product2', m_product_id: 3000002 },
];

const validBPartners = [
    { value: 'SUGITY', c_bpartner_id: 1000538 },
];

const validBPartnerLocations = [
    { name: 'MM2100', c_bpartner_id: 1000538, c_bpartner_location_id: 1000336 },
];


const validLocCycles = [
    { name: 'C1', c_bpartner_location_id: 1000336, adw_c_bpartner_loccycle_id: 1000001 },
    { name: 'C2', c_bpartner_location_id: 1000336, adw_c_bpartner_loccycle_id: 1000040 },
    { name: 'C3', c_bpartner_location_id: 1000336, adw_c_bpartner_loccycle_id: 1000041 },
    { name: 'C4', c_bpartner_location_id: 1000336, adw_c_bpartner_loccycle_id: 1000042 },
    { name: 'C5', c_bpartner_location_id: 1000336, adw_c_bpartner_loccycle_id: 1000046 },
];

const validSalesPeriods = [
    { name: 'Nov-25', c_periode_id: 1000334 },
    { name: 'Nov-25', c_periode_id: 1000333 },
    { name: 'Oct-25', c_periode_id: 1000332 },
];


const validTargetDocTypes = [
    { name: 'Delivery Order', c_doctype_id: 1000054 },
    { name: 'Standart Order', c_doctype_id: 132 },
    { name: 'Schedule Order', c_doctype_id: 1000053 },
];


const validateField = (value, fieldName, validSetOrMap, location, isOptional = false) => {
    // Jika field ini opsional dan nilainya kosong, anggap valid (tidak ada error)
    if (isOptional && (!value || String(value).trim() === '')) {
        return null;
    }

    // Jika field wajib tapi kosong
    if (!value || String(value).trim() === '') {
        return { ...location, field: fieldName, value: value || '', message: `${fieldName} tidak boleh kosong.` };
    }

    // .has() bekerja untuk Set dan Map, jadi fungsi ini fleksibel
    if (!validSetOrMap.has(String(value))) {
        return { ...location, field: fieldName, value: value, message: `${fieldName} "${value}" tidak ditemukan.` };
    }

    // Jika semua validasi lolos
    return null;
};


const validateDate = (dateValue, fieldName, location) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Fungsi kecil untuk membuat objek error dengan struktur baru
    const createError = (message, value) => ({
        ...location, // Menyalin { sheetIndex, type, index }
        field: fieldName,
        value: value,
        message: message
    });

    if (!dateValue) {
        return createError(`${fieldName} tidak boleh kosong.`, '');
    }
    if (typeof dateValue !== 'string') {
        return createError(`Tipe data ${fieldName} salah.`, dateValue);
    }
    if (!dateRegex.test(dateValue)) {
        return createError(`Format ${fieldName} salah. Harap gunakan format YYY-MM-DD.`, dateValue);
    }

    const parsedDate = new Date(dateValue);
    if (isNaN(parsedDate.getTime())) {
        return createError(`Tanggal di ${fieldName} tidak valid (contoh: ${dateValue} tidak ada di kalender).`, dateValue);
    }

    return null;
};


fastify.post('/api/validate-sales-order', async (request, reply) => {
    const allOrders = request.body;

    console.log(allOrders);

    const validationErrors = [];
    const connection = await oracleDB.openConnection();

    try {
        if (!Array.isArray(allOrders)) {
            return reply.code(400).send({ message: 'Format data tidak valid.' });
        }

        for (let sheetIndex = 0; sheetIndex < allOrders.length; sheetIndex++) {
            const order = allOrders[sheetIndex];

            //HEADERS
            if (order && order.header) {
                const header = order.header;
                const headerLocation = { sheetIndex, type: 'header' };
                let err;

                //Order Ref
                const orderRef = header.order_reference;
                if (!orderRef || String(orderRef).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Order Reference',
                        value: orderRef,
                        message: `Order Reference tidak boleh kosong.`
                    });
                }


                //Sales Period
                const salesPeriod = header.sales_period;
                if (!salesPeriod || String(salesPeriod).trim() === '' || String(salesPeriod).trim() === 'Invalid Date') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Sales Period',
                        value: salesPeriod,
                        message: `Sales Period Salah/Kosong.`
                    });
                } else {
                    const resSalesPeriode = await connection.execute(
                        `SELECT C_PERIOD_ID FROM C_PERIOD 
                                WHERE AD_CLIENT_ID = 1000000 AND Name = :name`,
                        { name: salesPeriod },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resSalesPeriode.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Sales Period',
                            value: salesPeriod,
                            message: `Sales Period "${salesPeriod}" tidak ditemukan.`
                        });
                    } else {
                        header.c_period_id = resSalesPeriode.rows[0].C_PERIOD_ID
                    }
                }

                // Doc Type
                const docType = header.target_document_type;
                if (!docType || String(docType).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Target Document Type',
                        value: docType,
                        message: `Target Document Type tidak boleh kosong.`
                    });
                } else {
                    const resDocType = await connection.execute(
                        'SELECT C_DOCTYPE_ID FROM C_DOCTYPE WHERE AD_CLIENT_ID = 1000000 AND NAME = :name',
                        { name: docType },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resDocType.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Target Document Type',
                            value: docType,
                            message: `Target Document Type "${docType}" tidak ditemukan.`
                        });
                    } else {
                        header.c_doctype_id = resDocType.rows[0].C_DOCTYPE_ID
                    }
                }

                // BP
                const bpartner = header.business_partner;
                if (!bpartner || String(bpartner).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Business Partner',
                        value: bpartner,
                        message: `Business Partner tidak boleh kosong.`
                    });
                } else {
                    const resBP = await connection.execute(
                        'SELECT C_BPartner_ID FROM C_BPartner WHERE value = :value',
                        { value: bpartner },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resBP.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Business Partner',
                            value: bpartner,
                            message: `Business Partner "${bpartner}" tidak ditemukan.`
                        });
                    } else {
                        header.c_bpartner_id = resBP.rows[0].C_BPARTNER_ID
                    }
                }

                // BP Location
                const bpartnerLocation = header.partner_location;
                const bpartner_id = header.c_bpartner_id;
                if (!bpartnerLocation || String(bpartnerLocation).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Business Partner Location',
                        value: bpartnerLocation,
                        message: `Business Partner Location tidak boleh kosong.`
                    });
                } else {
                    const resLocation = await connection.execute(
                        `SELECT C_BPARTNER_LOCATION_ID, NAME 
                            FROM C_BPARTNER_LOCATION cbl 
                        WHERE 
                            cbl.C_BPARTNER_ID = :bpartner_id AND NAME = :name`,
                        { bpartner_id: bpartner_id, name: bpartnerLocation },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resLocation.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Business Partner Location',
                            value: bpartnerLocation,
                            message: `Business Partner Location "${bpartnerLocation}" tidak ditemukan.`
                        });
                    } else {
                        header.c_bpartner_location_id = resLocation.rows[0].C_BPARTNER_LOCATION_ID;
                    }
                }

                // BP Location Cycle
                const bpartnerLocCycle = header.loc_cycle;
                const bpLocCycleId = header.c_bpartner_location_id
                if (!bpartnerLocCycle || String(bpartnerLocCycle).trim() === '') {
                    header.adw_c_bpartner_loccycle_id = 0
                    // validationErrors.push({
                    //     ...headerLocation,
                    //     field: 'Business Partner Location Cycle',
                    //     value: bpartnerLocation,
                    //     message: `Business Partner Location Cycle tidak boleh kosong.`
                    // });
                } else if (bpLocCycleId && bpartnerLocCycle) {
                    const resLocCycle = await connection.execute(
                        `SELECT ADW_C_BPARTNER_LOCCYCLE_ID 
                        FROM ADW_C_BPartner_LocCycle
                        WHERE NAME = :name AND C_BPARTNER_LOCATION_ID = :bp_loc_cycle_id`,
                        { name: bpartnerLocCycle, bp_loc_cycle_id: bpLocCycleId },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resLocCycle.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Loc Cycle',
                            value: bpartnerLocCycle,
                            message: `Business Partner Location Cycle "${bpartnerLocCycle}" tidak ditemukan.`
                        });
                    } else {
                        header.adw_c_bpartner_loccycle_id = resLocCycle.rows[0].ADW_C_BPARTNER_LOCCYCLE_ID;
                    }
                }

                // Price List
                const priceList = header.price_list
                if (!priceList || String(priceList).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Price List',
                        value: priceList,
                        message: `Price List tidak boleh kosong.`
                    });
                } else {
                    const resPriceList = await connection.execute(
                        `SELECT mp.M_PRICELIST_ID 
                        FROM M_PRICELIST mp 
                        WHERE NAME = :name AND mp.ISACTIVE = 'Y'`,
                        { name: priceList },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resPriceList.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Price List',
                            value: priceList,
                            message: `Price List "${priceList}" tidak ditemukan.`
                        });
                    } else {
                        header.m_pricelist_id = resPriceList.rows[0].M_PRICELIST_ID;
                    }
                }

                // Delivery Via
                const delVia = header.delivery_via
                if (!delVia || String(delVia).trim() === '') {
                    validationErrors.push({
                        ...headerLocation,
                        field: 'Delivery Via',
                        value: delVia,
                        message: `Delivery Via tidak boleh kosong.`
                    });
                } else {
                    const resDelVia = await connection.execute(
                        `SELECT NAME FROM AD_REF_LIST arl 
                        WHERE arl.AD_REFERENCE_ID=152 AND arl.NAME = :name -- C_ORDER DELIVERY VIA RULE`,
                        { name: delVia },
                        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                    );

                    if (resDelVia.rows.length === 0) {
                        validationErrors.push({
                            ...headerLocation,
                            field: 'Delivery Via',
                            value: delVia,
                            message: `Delivery Via "${delVia}" tidak ditemukan.`
                        });
                    }
                }

                // Validate date
                err = validateDate(header.date_ordered, 'Date Ordered', headerLocation);
                if (err) validationErrors.push(err);

                err = validateDate(header.date_promised, 'Date Promised', headerLocation);
                if (err) validationErrors.push(err);
            }

            //LINES
            if (order && Array.isArray(order.lines)) {
                for (let lineIndex = 0; lineIndex < order.lines.length; lineIndex++) {
                    const line = order.lines[lineIndex];
                    const lineLocation = { sheetIndex, type: 'line', index: lineIndex };
                    let err;

                    //Product
                    const partNo = line.product;
                    if (!partNo || String(partNo).trim() === '') {
                        validationErrors.push({
                            ...lineLocation,
                            field: 'Product',
                            value: partNo,
                            message: `Part No tidak boleh kosong.`
                        });
                    } else {
                        const resProduct = await connection.execute(
                            'SELECT M_PRODUCT_ID FROM M_Product WHERE Value = :value',
                            { value: partNo },
                            { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                        );

                        if (resProduct.rows.length === 0) {
                            validationErrors.push({
                                ...lineLocation,
                                field: 'PartNo Product',
                                value: partNo,
                                message: `PartNo Product "${partNo}" tidak ditemukan.`
                            });
                        } else {
                            line.m_product_id = resProduct.rows[0].M_PRODUCT_ID
                        }
                    }

                    const quantity = line.quantity;
                    const qtyAsNumber = Number(quantity);
                    if (quantity === null || quantity === undefined || isNaN(qtyAsNumber) || qtyAsNumber <= 0) {
                        validationErrors.push({ ...lineLocation, field: 'Quantity', value: quantity, message: `Quantity harus berupa angka lebih besar dari 0.` });
                    }

                    // date ordered line sama dengan date ordered header
                    // err = validateDate(line.date_ordered, 'Date Ordered', lineLocation);
                    // if (err) validationErrors.push(err);

                    err = validateDate(line.date_promised, 'Date Promised', lineLocation);
                    if (err) validationErrors.push(err);

                }
            }
        };

        if (validationErrors.length > 0) {
            // Jika ada error, kirim daftar error
            return reply.code(400).send({
                message: 'Ditemukan error validasi.',
                errors: validationErrors,
            });

        } else {
            for (const dData of allOrders) {
                if (Array.isArray(dData.lines)) {
                    for (const l of dData.lines) {
                        delete l.product;
                    }
                }
            }

            return reply.code(200).send({
                message: 'Validasi berhasil!',
                data: allOrders
            });
        }
    } catch (err) {
        console.error(err);
        return reply.code(500).send({ message: "Server error", error: err });
    } finally {
        await connection.close(); // Tutup 1x saja
    }


});

// Jalankan server
const start = async () => {
    try {
        // Server akan berjalan di port 3001
        await fastify.listen({ port: 3001, host: '0.0.0.0' });
        fastify.log.info(`Server berjalan di port ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();