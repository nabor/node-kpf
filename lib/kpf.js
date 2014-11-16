"use strict";
var fs = require('fs');
var os = require('os');
var crypto = require('crypto');
var he = require('he');


function FlowAPI(request, config) {
    var _req = request;
    var _config = config;
    var _order = {
        orden_numero: "",
        concepto: "",
        monto: "",
        comision: _config.flow_tasa_dafault,
        flow_numero: "",
        pagador: "",
        status: "",
        error: ""
    };
    /**
     * Registra en el Log de Flow
     *
     * @param message El mensaje a ser escrito en el log
     * @param type Identificador del mensaje
     *
     */
    this.showConfig = function () {
        return _config;
    };

    function _flow_log(message, type) {
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
    this.flow_log = _flow_log;
    /**
    * Set el número de Orden del comercio
    *
    * @param orderNumber El número de la Orden del Comercio
    * @return boolean
    */
    this.setOrderNumber = function (orderNumber) {
        if (orderNumber) {
            _order.orden_numero = orderNumber;
            _flow_log("Asigna Orden N°: " + _order.orden_numero, '');
            return true;
        } else {
            return false;
        }
    };

    /**
    * Set el concepto de pago
    *
    * @param concepto El concepto del pago
    *
    * @return boolean
    */
    this.setConcept = function (concepto) {
        if(concepto) {
            _order.concepto = concepto;
            return true;
        } else {
            return false;
        }
    };

    /**
    * Set el monto del pago
    *
    * @param monto El monto del pago
    *
    * @return boolean
    */
    this.setAmount = function (monto) {
        if(monto) {
            _order.monto = monto;
            return true;
        } else {
            return false;
        }
    };

    /**
    * Set la tasa de comisión, por default la tasa será la configurada en config.php
    *
    * @param comision La comisión Flow del pago
    *
    * @return boolean
    */
    this.setRate = function (comision) {
        if(comision && (comision == 1 || comision == 2 || comision == 3)) {
            _order.comision = comision;
            return true;
        } else {
            return false;
        }
    };

    // Metodos GET

    /**
    * Get el número de Orden del Comercio
    *
    * @return string el número de Orden del comercio
    */
    this.getOrderNumber = function () {
        return _order.orden_numero;
    };

    /**
    * Get el concepto de Orden del Comercio
    *
    * @return string el concepto de Orden del comercio
    */
    this.getConcept = function () {
        return _order.concepto;
    };

    /**
    * Get el monto de Orden del Comercio
    *
    * @return string el monto de la Orden del comercio
    */
    this.getAmount = function () {
        return _order.monto;
    };

    /**
    * Get la comisión Flow de Orden del Comercio
    *
    * @return string la tasa de la Orden del comercio
    */
    this.getRate = function () {
        return _order.comision;
    };

    /**
    * Get el estado de la Orden del Comercio
    *
    * @return string el estado de la Orden del comercio
    */
    this.getStatus = function () {
        return _order.status;
    };

    /**
    * Get el número de Orden de Flow
    *
    * @return string el número de la Orden de Flow
    */
    this.getFlowNumber = function getFlowNumber() {
        return _order.flow_numero;
    };

    /**
    * Get el email del pagador de la Orden
    *
    * @return string el email del pagador de la Orden de Flow
    */
    this.getPayer = function getPayer() {
        return _order.pagador;
    };

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
    this.new_order = function (orden_compra, monto,  concepto, tipo_comision) {
        tipo_comision = typeof tipo_comision !== 'undefined' ? tipo_comision : _config.flow_tasa_default;
        _flow_log("Iniciando nueva Orden", "new_order");
        if(!orden_compra || !monto || !concepto) {
            _flow_log("Error: No se pasaron todos los parámetros obligatorios","new_order");
        }
        if(typeof monto !== 'number') {
            _flow_log("Error: El parámetro monto de la orden debe ser numérico","new_order");
            throw new Error("El monto de la orden debe ser numérico");
        }
        _order.orden_numero = orden_compra;
        _order.concepto = concepto;
        _order.monto = monto;
        _order.comision = tipo_comision;
        return _flow_pack();
    };
    
    /**
    * Lee los datos enviados desde Flow a la página de confirmación del comercio
    *
    */
    this.read_confirm = function (response) {
        if(!response) {
            _flow_log("Respuesta Inválida", "read_confirm");
            throw new Error('Invalid response');
        }
        
        if(!response.status) {
            _flow_log("Respuesta sin status", "read_confirm");
            throw new Error('Invalid response status');
        }
        _order.status = response.status;
        _flow_log("Lee Status: " + response.status, "read_confirm");
        if (!response.s) {
            _flow_log("Mensaje no tiene firma", "read_confirm");
            throw new Error('Invalid response (no signature)');
        }
        if(!_flow_sign_validate(response.s, response)) {
            _flow_log("firma invalida", "read_confirm");
            throw new Error('Invalid signature from Flow');
        }
        _flow_log("Firma verificada", "read_confirm");
        if(data.status == "ERROR") {
            _flow_log("Error: " + response.kpf_error, "read_confirm");
            _order.error = response.kpf_error;
            return;
        }
        if(!response.kpf_orden) {
            throw new Error('Invalid response Orden number');
        }
        _order.orden_numero = response.kpf_orden;
        _flow_log("Lee Numero Orden: " + response.kpf_orden, "read_confirm");
        if(!response.kpf_monto) {
            throw new Error('Invalid response Amount');
        }
        _order.monto = response.kpf_monto;
        _flow_log("Lee Monto: " + response.kpf_monto, "read_confirm");
        if(response.kpf_flow_order) {
            _order.flow_numero = response.kpf_flow_order;
            _flow_log("Lee Orden Flow: " + response.kpf_flow_order, "read_confirm");
        }

    };

    /**
    * Método para responder a Flow el resultado de la confirmación del comercio
    *
    * @param result (true: Acepta el pago, false rechaza el pago)
    *
    * @return string paquete firmado para enviar la respuesta del comercio
    */
    this.build_response = function (result){
        var r = (!!result) ? "ACEPTADO" : "RECHAZADO";
        var q = "status=" + r + "&c=" + _config.flow_comercio;
        var s = _flow_sign(q);
        _flow_log("Orden N°: " + _order.orden_numero + " - Status: " + r,"flow_build_response");
        return q + "&s=" + s;
    };
    
    /**
    * Método para recuperar los datos  en la página de Exito o Fracaso del Comercio
    *
    */
    this.read_result = function (response) {
        if(!response) {
            _flow_log("Respuesta Inválida", "read_result");
            throw new Error('Invalid response');
        }
        if (!response.s) {
            _flow_log("Mensaje no tiene firma", "read_result");
            throw new Error('Invalid response (no signature)');
        }
        if(!_flow_sign_validate(response.s, response)) {
            _flow_log("firma invalida", "read_result");
            throw new Error('Invalid signature from Flow');
        }
        _order.comision = $flow_tasa_default;
        _order.status = "";
        _order.error = "";
        _order.orden_numero = response.kpf_orden;
        _order.concepto = response.kpf_concepto;
        _order.monto = response.kpf_monto;
        _order.flow_numero = response.kpf_flow_order;
        _order.pagador = response.kpf_pagador;
        _flow_log("Datos recuperados Orden de Compra N°: " + response.kpf_orden, "read_result");
    };

    // Funciones Privadas
    function _flow_get_public_key_id() {
        try {
            return fs.readFileSync(_config.flow_keys + "/flow.pubkey");
        } catch (e) {
            _flow_log("Error al intentar obtener la llave pública - Error-> " + e.message, "flow_get_public_key_id");
            throw new Error(e.message);
        }
    }

    function _flow_get_private_key_id() {
        try {
            return fs.readFileSync(_config.flow_keys + "/comercio.pem");
        } catch (e) {
            _flow_log("Error al intentar obtener la llave privada - Error-> " + e.message, "flow_get_private_key_id");
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
        response = response[0];
        var verifier = crypto.createVerify('SHA1');
        verifier.update(response);
        return verifier.verify(pub_key, signature, 'base64');
    }

    function _flow_pack() {
        var comercio = encodeURIComponent(_config.flow_comercio);
        var orden_compra = encodeURIComponent(_order.orden_numero);
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
        _flow_log("Orden N°: " + _order.orden_numero + " -empaquetado correcto","flow_pack");
        return p + "&s=" + signature;
    }
}

module.exports = FlowAPI;
