Kit Pago Flow
=============

# Instalar
```
$ npm install kpf
```

# Archivo configuracion
El archivo de configuracion debe estar en formato JSON
```json
{
    "flow_url_exito": "http://ejemplo.com/exito",
    "flow_url_fracaso": "http://ejemplo.com/fracaso",
    "flow_url_confirmacion": "http://ejemplo.com/confirma",
    "flow_tasa_default": 3,
    "flow_url_pago": "http://flow.tuxpan.com/app/kpf/pago.php", //para pruebas, cambiar en produccion
    "flow_keys": "/ruta/a/llaves/",
    "flow_logPath": "/ruta/a/logs/",
    "flow_comercio": "correo@comercio.com"
}
```

# Uso
Para poder usar la api se debe importar y crear un nuevo objeto
```javascript
var FlowApi = require('kpf');

var config = require('/ruta/a/config.json');
var flow_api = new FlowApi(request, config);
```

Para generar los parametros para enviar a `flow_url_pago` se usa la funcion `newOrder`
```javascript
var flow_pack = flow_api.newOrder(numero_orden, total, descripcion);
```
Luego se debe enviar por metodo POST a la url definida en `flow_url_pago` el valor obtenido en `flow_pack` 
Por ejemplo a travez de un formulario 
```
<form id="flow-form" method="post" action="http://flow.tuxpan.com/app/kpf/pago.php">
    <input type="hidden" name="parameters" value="[flow_pack]">
    <button type="submit">
        <img id="flow" src="https://www.flow.cl/img/boton11.png">
    </button>
</form>
```
Esto reenvia al usuario a la pagina de flow donde se realiza el pago
Flow llama a la url definida en `flow_url_confirmacion` para confirmar el pago
Para revisar la informacion enviada por post y ver si el pago es valido 
```
var flow_confirm;
var resultado;
try {
    flow_confirm = flow_api.readConfirm(req.body.response);
} catch(e)  {
    console.log("ERROR: " + e.message);
    resultado = flow_api.buildResponse(false); // Genera una respuesta de fracaso
}
```
La funcion `buildResponse` genera una respuesta para el llamado a `flow_url_confirmacion`

Para poder obtener la informacion enviada y poder verificar el pago existen las siguientes funciones
```
flow_api.getOrderNumber() {
flow_api.getConcept() {
flow_api.getAmount() {
flow_api.getRate() {
flow_api.getStatus() {
flow_api.getFlowNumber()
flow_api.getPayer()
```
Para generar una respuesta se debe utilizar la funcion `buildResponse`
En caso de error o que el pago sea inválido se debe enviar una respuesta con parametro `false`
Si el pago es válido se debe enviar una respuesta con parametro `true`
Luego se debe responder el resultado de `buildResponse` a la llamada a `flow_url_confirmacion`

Dependiendo si el pago es valido o no flow luego llama a `flow_url_exito` o `flow_url_fracaso`a traves de POST
Para obtener los datos enviados por flow en dichos llamados se debe obtener el parametro `response` desde los datos enviados por POST
Por ejemplo en express.js
```
var response = req.body.response;
var flow_confirm = flow_api.readResult(response);
```
Se dispone de las mismas funciones que en el llamado a `flow_url_confirmacion` para entregar una respuesta pertinente.
 

Para mayor informacion acerca del uso de Flow: [Api Flow](http://flow.cl/apiFlow.php)


