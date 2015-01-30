"use strict";
var fs = require('fs');
var os = require('os');
var crypto = require('crypto');
var he = require('he');
var urljson = require('urlcode-json');


function FlowAPI(request, config) {
    var _req = request;
    var _config = config;
    var _order = {
        id: "",
        concepto: "",
        monto: "",
        comision: _config.flow_tasa_default,
        flow_id: "",
        pagador: "",
        status: "",
        error: ""
    };
    // Funciones Privadas
    function _flowLog(message, type) {
        var data;
        var now = new Date();
        var today = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay();
        var log = "[ " + now.toISOString()
            + " " + _req.connection.remoteAddress
            + " " + _req.headers['x-forwarded-for']
            + " - " + type + " ] " + message + os.EOL;
        try {
            data = fs.appendFileSync(config.flow_logPath + "/flow_" + today + ".log", log);
        } catch (e) {
            return false;
        }
    }

    function _flow_get_public_key_id() {
        try {
            return fs.readFileSync(_config.flow_keys + "/flow.pubkey");
        } catch (e) {
            _flowLog("Error al intentar obtener la llave pública - Error-> " + e.message, "flow_get_public_key_id");
            throw new Error(e.message);
        }
    }

    function _flow_get_private_key_id() {
        try {
            return fs.readFileSync(_config.flow_keys + "/comercio.pem");
        } catch (e) {
            _flowLog("Error al intentar obtener la llave privada - Error-> " + e.message, "flow_get_private_key_id");
            throw new Error(e.message);
        }
    }

    function _flow_sign(data) {
        var priv_key = _flow_get_private_key_id();
        var sign = crypto.createSign('SHA1');
        sign.update(data);
        return sign.sign(priv_key, 'base64');
    }

    function _flow_sign_validate(signature, data) {
        var pub_key = _flow_get_public_key_id();
        var response = data.split("&s=", 2);
        signature = decodeURIComponent(signature);
        response = response[0];
        var verifier = crypto.createVerify('SHA1');
        verifier.update(response);
        return verifier.verify(pub_key, signature, 'base64');
    }

    function _flow_pack() {
        var comercio = encodeURIComponent(_config.flow_comercio);
        var orden_compra = encodeURIComponent(_order.id);
        var monto = encodeURIComponent(_order.monto);
        var tipo_comision = encodeURIComponent(_order.comision);
        var concepto = encodeURIComponent(he.encode(_order.concepto));

        var url_exito = encodeURIComponent(_config.flow_url_exito);
        var url_fracaso = encodeURIComponent(_config.flow_url_fracaso);
        var url_confirmacion = encodeURIComponent(_config.flow_url_confirmacion);

        var p = "c=" + comercio
            + "&oc=" + orden_compra
            + "&tc=" + tipo_comision
            + "&m=" + monto
            + "+&o=" + concepto
            + "&ue=" + url_exito
            + "&uf=" + url_fracaso
            + "&uc=" + url_confirmacion;

        var signature = _flow_sign(p);
        _flowLog("Orden N°: " + _order.id + " -empaquetado correcto","flow_pack");
        return p + "&s=" + signature;
    }

    // Funciones Publicas
    /**
    * Crea una nueva Orden para ser enviada a Flow
    *
    * @param orden_compra El número de Orden de Compra del Comercio
    * @param monto El monto de Orden de Compra del Comercio
    * @param concepto El concepto de Orden de Compra del Comercio
    * @param tipo_comision La comision de Flow (1,2,3)
    *
    * @return string flow_pack Paquete de datos firmados listos para ser enviados a Flow
    */
    this.newOrder = function (orden_compra, monto,  concepto, tipo_comision) {
        tipo_comision = typeof tipo_comision !== 'undefined' ? tipo_comision : _config.flow_tasa_default;
        _flowLog("Iniciando nueva Orden", "newOrder");
        if(!orden_compra || !monto || !concepto) {
            _flowLog("Error: No se pasaron todos los parámetros obligatorios","newOrder");
        }
        if(typeof monto !== 'number') {
            _flowLog("Error: El parámetro monto de la orden debe ser numérico","newOrder");
            throw new Error("El monto de la orden debe ser numérico");
        }
        _order.id = orden_compra;
        _order.concepto = concepto;
        _order.monto = monto;
        _order.comision = tipo_comision;
        return _flow_pack();
    };

    /**
    * Lee los datos enviados desde Flow a la página de confirmación del comercio
    *
    */
    this.readConfirm = function (response_string) {
        var response = urljson.decode(response_string);
        if(!response) {
            _flowLog("Respuesta Inválida", "readConfirm");
            throw new Error('Invalid response');
        }
        if(!response.status) {
            _flowLog("Respuesta sin status", "readConfirm");
            throw new Error('Invalid response status');
        }
        _order.status = response.status;
        _flowLog("Lee Status: " + response.status, "readConfirm");
        if (!response.s) {
            _flowLog("Mensaje no tiene firma", "readConfirm");
            throw new Error('Invalid response (no signature)');
        }
        if(!_flow_sign_validate(response.s, response_string)) {
            _flowLog("firma invalida", "readConfirm");
            throw new Error('Invalid signature from Flow' );
        }
        _flowLog("Firma verificada", "readConfirm");
        if(response.status == "ERROR") {
            _flowLog("Error: " + response.kpf_error, "readConfirm");
            _order.error = response.kpf_error;
            return;
        }
        if(!response.kpf_orden) {
            throw new Error('Invalid response Orden number');
        }
        _order.id = response.kpf_orden;
        _flowLog("Lee Numero Orden: " + response.kpf_orden, "readConfirm");
        if(!response.kpf_monto) {
            throw new Error('Invalid response Amount');
        }
        _order.monto = response.kpf_monto;
        _flowLog("Lee Monto: " + response.kpf_monto, "readConfirm");
        if(response.kpf_flow_order) {
            _order.flow_id = response.kpf_flow_order;
            _flowLog("Lee Orden Flow: " + response.kpf_flow_order, "readConfirm");
        }
        return _order;
    };

    /**
    * Método para responder a Flow el resultado de la confirmación del comercio
    *
    * @param result (true: Acepta el pago, false rechaza el pago)
    *
    * @return string paquete firmado para enviar la respuesta del comercio
    */
    this.buildResponse = function (result){
        var r = (!!result) ? "ACEPTADO" : "RECHAZADO";
        var q = "status=" + r + "&c=" + _config.flow_comercio;
        var s = _flow_sign(q);
        _flowLog("Orden N°: " + _order.id + " - Status: " + r,"buildResponse");
        return q + "&s=" + s;
    };

    /**
    * Método para recuperar los datos  en la página de Exito o Fracaso del Comercio
    *
    */
    this.readResult = function (response_string) {
        var response = urljson.decode(response_string);
        if(!response) {
            _flowLog("Respuesta Inválida", "readResult");
            throw new Error('Invalid response');
        }
        if (!response.s) {
            _flowLog("Mensaje no tiene firma", "readResult");
            throw new Error('Invalid response (no signature)');
        }
        if(!_flow_sign_validate(response.s, response_string)) {
            _flowLog("firma invalida", "readResult");
            throw new Error('Invalid signature from Flow');
        }
        _order.comision = _config.flow_tasa_default;
        _order.status = "";
        _order.error = "";
        _order.id = response.kpf_orden;
        _order.concepto = response.kpf_concepto;
        _order.monto = response.kpf_monto;
        _order.flow_id = response.kpf_flow_order;
        _order.pagador = response.kpf_pagador;
        _flowLog("Datos recuperados Orden de Compra N°: " + response.kpf_orden, "readResult");
    };
}

FlowAPI.prototype = {
    // Setters
    /**
    * Set el número de Orden del comercio
    *
    * @param orderNumber El número de la Orden del Comercio
    */
    set order_number(orderNumber) {
        _order.id = orderNumber;
        _flowLog("Asigna Orden N°: " + _order.id, '');
    },

    /**
    * Set el concepto de pago
    *
    * @param concepto El concepto del pago
    */
    set concept(concepto) {
        _order.concepto = concepto;
    },

    /**
    * Set el monto del pago
    *
    * @param monto El monto del pago
    */
    set amount(monto) {
        _order.monto = monto;
    },

    /**
    * Set la tasa de comisión, por default la tasa será la configurada en config.php
    *
    * @param comision La comisión Flow del pago
    */
    set rate(comision) {
        if(comision == 1 || comision == 2 || comision == 3) {
            _order.comision = comision;
        } else {
            _order.comision = _config.flow_tasa_default;
        }
    },

    // Getters

    /**
    * Get el número de Orden del Comercio
    *
    * @return string el número de Orden del comercio
    */
    get order_number() {
        return _order.id;
    },

    /**
    * Get el concepto de Orden del Comercio
    *
    * @return string el concepto de Orden del comercio
    */
    get concept() {
        return _order.concepto;
    },

    /**
    * Get el monto de Orden del Comercio
    *
    * @return string el monto de la Orden del comercio
    */
    get amount() {
        return _order.monto;
    },

    /**
    * Get la comisión Flow de Orden del Comercio
    *
    * @return string la tasa de la Orden del comercio
    */
    get rate() {
        return _order.comision;
    },

    /**
    * Get el estado de la Orden del Comercio
    *
    * @return string el estado de la Orden del comercio
    */
    get status() {
        return _order.status;
    },

    /**
    * Get el número de Orden de Flow
    *
    * @return string el número de la Orden de Flow
    */
    get flow_number() {
        return _order.flow_id;
    },

    /**
    * Get el email del pagador de la Orden
    *
    * @return string el email del pagador de la Orden de Flow
    */
    get payer() {
        return _order.pagador;
    }
};

module.exports = FlowAPI;
