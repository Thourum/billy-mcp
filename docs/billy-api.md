<!-- Source: https://www.billy.dk/api/ -->

# Billy API v2 Documentation

Billy's new API is a JSON-based REST API. Our webapp uses the exact same API - which is your guarantee that the API will always support full functionality, and will generally be nice to work with. We take our own medicine!

If you have any questions or feedback (we love feedback!), please don't hesitate to write us at [dev@billy.dk](mailto:dev@billy.dk).

If you want to receive an email when we're updating or changing our API, you can subscribe here.

Submit

## Table of Contents

*   [Endpoint](#endpoint)
*   [Authentication](#authentication)
*   [Conventions](#conventions)
*   [Relationships](#relationships)
*   [Paging](#paging)
*   [Filtering](#filtering)
*   [Sorting](#sorting)
*   [Localization](#localization)
*   [Code examples](#code-examples)
*   [Use case examples](#use-case-examples)
*   [Resource documentation](#resource-documentation)

## Endpoint

The API is located at `https://api.billysbilling.com/v2`.

All requests must use SSL.

## Authentication

We currently support two authentication methods with the API.

### OAuth access tokens

Here's how to obtain an access token for your company:

*   Log into your account on [mit.billy.dk](https://mit.billy.dk/).
*   Go to Settings -> Access tokens.
*   Click Create access token.
*   Enter a descriptive name for your token, so you can easily identify it later. Then hit the Save button.
*   Hover over the newly-generated access token and click the magnifier icon to show it clearly.
*   The token will now be selected in a text field, inside a lightbox.

All you have to do now is put this token in a `X-Access-Token` header. See [Code examples](#code-examples) for a complete example.

The tokens you create under Settings -> Access tokens are tied to that company only. If you have multiple companies, you'll need a separate token for each one. Tokens are permanent - the don't expire.

We plan to support a 3-legged OAuth solution eventually.

### HTTP basic auth

You can use your normal email and password for authentication [HTTP Basic Auth](https://en.wikipedia.org/wiki/Basic_access_authentication). You can try it right now, if you like. Just navigate to `https://api.billysbilling.com/v2/user`. Enter your email and password in the browser's credentials form, and you'll see your user as a JSON document.

## Conventions

Billy's API is very consistent; we use the same conventions for all resources. Generally speaking, there are 5 ways to interact with a resource: Get one item, list, create, update and delete.

A resource is always accessed through its pluralized name. For example, you can access invoices through `/v2/invoices`.

In the examples that follow, we'll use the `invoices` resource - but the exact same pattern applies to all resources.

### Getting a single record

When getting a single record, you should use `GET /v2/invoices/:id` (where `:id` denotes a dynamic slug, and should be replaced by a real invoice ID). The response will be a JSON document with a root key named after the singular name containing the requested record. Invoice example:

{
      "invoice": {
        "id": "3mIN9EbDEeOg8QgAJ4gM",
        "invoiceNo": 41,
        ...
      }
    }

### Listing a resource

Use `GET /v2/invoices`. The response will be a JSON document with a root key named after the pluralized designation and containing an array of found records. Invoice example:

{
    "invoices": \[
      {
        "id": "3mIN9EbDEeOg8QgAJ4gM",
        "invoiceNo": 41,
        ...
      },
      {
        "id": "4LmaTkbDEeOg8QgAJ4to",
        "invoiceNo": 42,
        ...
      }
    \]
  }

### Creating a record

Use `POST /v2/invoices`. The request body should be a JSON document containing a single root key named after the singular name, and should be a hash of record properties. Invoice example:

{
    "invoice": {
      "invoiceNo": 41,
      "entryDate": "2013-11-14",
      ...
    }
  }

See more about the response body in the section [Responses to create/update/delete](#responses-to-createupdatedelete-requests). You can get the ID of the newly created record by getting `invoices.0.id` in the returned JSON document.

### Updating a record

Use `PUT /v2/invoices/:id`. The request body should be a JSON document containing a single root key named after the singular name, and should be a hash of record properties. The hash does not need to include the record's ID - if it does, though, it must be exactly the same ID you used in the URL. You can't change a record's ID. Invoice example:

{
  "invoice": {
    "contactMessage": 41,
    ...
  }
}

Only properties that you set in the `invoice` hash will be updated. Properties that are left out will be considered as if they are the same. So if all you need to do is to update the `contactMessage` property, then you don't need to include any other properties.

The response works the same as with a `POST` request.

### Deleting a record

Use `DELETE /v2/invoices/:id`. The request should not have a body.

`DELETE` requests are idempotent, meaning that if you try to `DELETE` the same record more than once (or delete any other non-existing ID), you will still receive a `200 OK` response.

See more about the response body in the section ['Responses to create/update/delete requests'](#responses-to-createupdatedelete-requests).

### Responses to create/update/delete requests

When you make `POST`, `PUT`, `PATCH` or `DELETE` requests to the API, the response will always include all records that changed because of the request. The record you created/updated will of course be included. Example: When you create an `invoiceLine` for an existing `invoice`, the `amount` field on the `invoice` will also be changed. So a `POST /v2/invoiceLines` would return something like:

{
        "invoices": \[
          {
            "id": "3mIN9EbDEeOg8QgAJ4gM",
            "amount": 200,
            ...
          }
        \],
        invoiceLines: \[
          {
            "id": "cgYxHZWCSfajDIvj9Q8yRQ",
            "invoiceId": "3mIN9EbDEeOg8QgAJ4gM",
            ...
          }
        \]
      }

The IDs of deleted records will be accessible through the `meta.deletedRecords` property. Example: When requesting `DELETE /v2/invoices/1234`, the response will be:

{
      "meta": {
        "deletedRecords": {
          "invoices": \[
            "1234"
          \]
        }
      }
    }

Note that some `PUT` requests may delete records, too - for example, when you overwrite a record's has-many relationship using an embedded array of child records.

## Relationships

The API is smart about relationships. Many resources have relationships, and we distinguish between two kinds of relationships:

*   Belongs-to: A record of resource A has an ID that points to a record of resource B. Example: `invoice` records have a `contactId` property which points to a `contact` record.
*   Has-many: A record of resource A has zero or more records of resource B that point to it. Example: `invoice` records have zero or more `invoiceLine` records that have an `invoiceId` property, which points back. A has-many relationship always implies a belongs-to relationship on the inverse resource.

Normally, when you `GET` a resource that has relationships, the belongs-to relationship will be presented as the name of the property, suffixed with `Id` and containing the ID. If you `GET /v2/invoices/123` and it responds with a `"contactId": "987"`, you can get the `contact` by requesting `GET /v2/contacts/987`. Has-many relationships won't be in the request, by default.

### Requesting sideloaded or embedded records

You can include relationships by adding an `include` parameter to your `GET` request. The value of the `include` parameter should be in the form `resource.property:mode[,resource.property:mode,...]`, where `resource` is the name of a resource, `property` is the name of a property of that resource, and `mode` is either `sideload` (default if the `:` part is omitted) or `embed`. You can include multiple relationships by separating them with `,`.

Example: You can load `invoices` with its `invoiceLines` embedded, its `contacts` sideloaded, and the contact's country embedded by doing `GET /invoices?include=invoice.lines:embed,invoice.contact:sideload,contact.country:embed`. The response will be something like:

{
      "invoices: \[
        {
          "id": "invoice1",
          "contactId": "contact1",
          ...
          "lines": \[
            {
              "id": "line1",
              ...
            },
            {
              "id": "line2",
              ...
            }
          \]
        }
      \],
      "contacts: \[
        {
          "id": "contact1",
          "country": {
            "id": "DK",
            "name": "Denmark",
            ...
          },
          ...
        }
      \]
    }

When sideloading belongs-to relationships, the name of the key is the singular name of the resource, suffixed with `Id` (like the default behavior), and each sideloaded record can be found in a root key named after the plural name of the belongs-to inverse resource. It's recommended to sideload records instead of embedding, to avoid duplication (each belongs-to record is only included in the response once).

When embedding belongs-to relationships, the name of the key is the singular name of the resource, for example `contact` - and it contains all the record's properties.

When sideloading has-many relationships, all the child IDs are included as an array of strings in the parent record, in a key named after the relationship's name (not the inverse resource), suffixed with `Ids`.

When embedding has-many relationships, all the full child records are included as an array of hashes in the parent record, in a key named after the relationship's name (not the inverse resource).

### Saving embedded records

Some resources supports saving child records embedded. An example is invoices. A `POST /v2/invoices`'s request body could look like this:

{
      "invoice": {
        "invoiceNo": 41,
        ...
        "lines:" \[
          {
            "productId": "...",
            "unitPrice": 100,
            ...
          }
        \]
      }
    }

It's advantageous to embed records when possible, as you get fewer round trips to the API, and everything happens as an atomic transaction (either all or no records are saved).

## Paging

You can limit long lists of resources using the paging URL params.

To use pages, you can use `page` and `pageSize`. For example, to get the second page containing 20 records per page, you would request `GET /v2/invoices?page=2&amp;pageSize=20`.

`pageSize` cannot be greater than `1000` (which is also the default if `pageSize` is omitted).

Whether your results are truncated/paged can be found in the `meta.paging` key in the response. It will look something like:

{
      "meta": {
        "paging": {
          "page": 4,
          "pageCount": 9,
          "pageSize": 20,
          "total": 192,
          "firstUrl": "https://api.billysbilling.com/v2/invoices?pageSize=20",
          "previousUrl": "https://api.billysbilling.com/v2/invoices?page=3&amp;pageSize=20",
          "nextUrl": "https://api.billysbilling.com/v2/invoices?page=5&amp;pageSize=20",
          "lastUrl": "https://api.billysbilling.com/v2/invoices?page=9&amp;pageSize=20"
        }
      },
      "invoices": \[...\]
    }

## Filtering

When listing most resources, you can filter the results by various properties. See filtering for [bills](#v2BillsFilter), [daybook transactions](#v2DaybookTransactionsFilter), [invoices](#v2InvoicesFilter).

## Sorting

When listing most resources, you can sort the results using the `sortProperty` and `sortDirection` URL params. Each resource only allows sorting by specific properties. Those properties are noted in each resource's documentation. The `sortDirection` must be either `ASC` (default) or `DESC`.

## Localization

When using the API, you can get localized responses for system texts like error messages, account names, etc. Add your preferred locale to the `Accept-Language` header to your requests. Supported locales are `"en_US"` for english, `"da_DK"` for danish, `"fr_FR"` for french, `"nl_NL"` for dutch, `"de_DE"` for german.

## Code examples

### PHP

<?php
    // Reusable client for sending requests to the Billy API
    class BillyClient {
        private $apiToken;
    
        public function \_\_construct($apiToken) {
            $this->apiToken = $apiToken;
        }
    
        public function request($method, $url, $body = null) {
            try {
                $c = curl\_init("https://api.billysbilling.com/v2" . $url);
                curl\_setopt($c, CURLOPT\_RETURNTRANSFER, true);
                curl\_setopt($c, CURLOPT\_CUSTOMREQUEST, $method);
    
                // Set headers
                curl\_setopt($c, CURLOPT\_HTTPHEADER, array(
                    "X-Access-Token: " . $this->apiToken,
                    "Content-Type: application/json"
                ));
    
                if ($body) {
                    // Set body
                    curl\_setopt($c, CURLOPT\_POSTFIELDS, json\_encode($body));
                }
    
                // Execute request
                $res = curl\_exec($c);
                $status = curl\_getinfo($c, CURLINFO\_HTTP\_CODE);
                $body = json\_decode($res);
    
                if ($status >= 400) {
                    throw new Exception("$method: $url failed with $status - $res");
                }
    
                return $body;
            } catch (Exception $e) {
                print\_r($e);
                throw $e;
            }
        }
    }
    
    // Creates a contact. The server replies with a list of contacts and we
    // return the id of the first contact of the list
    function createContact($client, $organizationId) {
        $contact = array(
            'organizationId' => $organizationId,
            'name' => "Ninjas",
            'countryId' => "DK"
        );
        $res = $client->request("POST", "/contacts", array('contact' => $contact));
    
        return $res->contacts\[0\]->id;
    }
    
    // Creates a product. The server replies with a list of products and we
    // return the id of the first product of the list
    function createProduct($client, $organizationId) {
        $product = array(
            'organizationId' => $organizationId,
            'name' => 'Pens',
            'prices' => \[array(
                'unitPrice' => 200,
                'currencyId' => 'DKK'
            )\]
        );
        $res = $client->request("POST", "/products", array('product' => $product));
    
        return $res->products\[0\]->id;
    }
    
    // Creates an invoice, the server replies with a list of invoices and we
    // return the id of the first invoice of the list
    function createInvoice($client, $organizationId, $contactId, $productId) {
        $invoice = array(
            'organizationId' => $organizationId,
            'invoiceNo' => 991,
            'entryDate' => '2013-11-14',
            'contactId' => $contactId,
            'lines' => \[array(
                'productId' => $productId,
                'unitPrice' => 200
            )\]
        );
        $res = $client->request("POST", "/invoices", array('invoice' => $invoice));
    
        return $res->invoices\[0\]->id;
    }
    
    // Gets the id of the organization associated with the API token.
    function getOrganizationId($client) {
        $res = $client->request("GET", "/organization");
    
        return $res->organization->id;
    }
    
    function getInvoice($client, $invoiceId) {
        $res = $client->request("GET", "/invoices", $invoiceId);
    
        return $res->invoices\[0\];
    }
    
    function main() {
        $client = new BillyClient("YOUR ACCESS TOKEN HERE");
    
        $currentOrganizationId = getOrganizationId($client);
        $newContactId = createContact($client, $currentOrganizationId);
        $newProductId = createProduct($client, $currentOrganizationId);
        $newInvoiceId = createInvoice($client, $currentOrganizationId, $newContactId, $newProductId);
        $newlyCreatedInvoice = getInvoice($client, $newInvoiceId);
    
        print\_r($newlyCreatedInvoice);
    }
    
    // Run script which creates a new contact, a product and an invoice
    main()

### Node.js 8+

First run `npm install axios`.

const axios = require('axios')
    class BillyClient {
        constructor (apiToken) {
            this.apiToken = apiToken
        }
    
        async request (method, url, body) {
            try {
                const res = await axios({
                    baseURL: 'https://api.billysbilling.com/v2',
                    method,
                    url,
                    headers: {
                        'X-Access-Token': this.apiToken,
                        'Content-Type': 'application/json'
                    },
                    data: body
                })
    
                if (res.status >= 400) {
                    throw new Error(${method}: ${url} failed with ${res.status} - ${res.data})
                }
    
                return res.data
            } catch (e) {
                console.error(e)
                throw e
            }
        }
    }
    
    // Creates a contact. The server replies with a list of contacts and we
    // return the id of the first contact of the list
    async function createContact (client, organizationId) {
        const contact = {
            'organizationId': organizationId,
            'name': 'John',
            'countryId': 'DK'
        }
        const res = await client.request('POST', '/contacts', { contact: contact })
    
        return res.contacts\[0\].id
    }
    
    // Creates a product. The server replies with a list of products and we
    // return the id of the first product of the list
    async function createProduct (client, organizationId) {
        const product = {
            'organizationId': organizationId,
            'name': 'Ninjas',
            'prices': \[{
                'unitPrice': 200,
                'currencyId': 'DKK'
            }\]
        }
        const res = await client.request('POST', '/products', { product: product })
    
        return res.products\[0\].id
    }
    
    // Creates an invoice, the server replies with a list of invoices and we
    // return the id of the first invoice of the list
    async function createInvoice (client, organizationId, contactId, productId) {
        const invoice = {
            'organizationId': organizationId,
            'invoiceNo': 5003,
            'entryDate': '2013-11-14',
            'contactId': contactId,
            'lines': \[{
                'productId': productId,
                'unitPrice': 200
            }\]
        }
        const res = await client.request('POST', '/invoices', { invoice: invoice })
    
        return res.invoices\[0\].id
    }
    
    // Gets the id of organization associated with the API token.
    async function getOrganizationId (client) {
        const res = await client.request('GET', '/organization')
    
        return res.organization.id
    }
    
    async function getInvoice (client, invoiceId) {
        const res = await client.request('GET', '/invoices', invoiceId)
    
        return res.invoices\[0\]
    }
    
    async function main () {
        const client = new BillyClient('YOUR_ACCESS_TOKEN')
    
        const currentOrganizationId = await getOrganizationId(client)
        const newContactId = await createContact(client, currentOrganizationId)
        const newProductId = await createProduct(client, currentOrganizationId)
        const newInvoiceId = await createInvoice(client, currentOrganizationId, newContactId, newProductId)
        const newlyCreatedInvoice = await getInvoice(client, newInvoiceId)
    
        console.log(newlyCreatedInvoice)
    }
    
    // Run script which creates a new contact, a product and an invoice
    main()

### Python 3

First run `pip3 install requests`.

import requests
  # Reusable class for sending requests to the Billy API
  class BillyClient:
      def \_\_init\_\_(self, apiToken):
          self.apiToken = apiToken
      def request(self, method, url, body):
          baseUrl = 'https://api.billysbilling.com/v2'
          try:
              response = {
                  'GET': requests.get(
                      baseUrl + url,
                      headers={'X-Access-Token': self.apiToken}
                  ),
                  'POST': requests.post(
                      baseUrl + url,
                      json=body,
                      headers={'X-Access-Token': self.apiToken}
                  ),
              }\[method\]
              status\_code = response.status\_code
              raw\_body = response.text
              if status\_code >= 400:
                  raise requests.exceptions.RequestException(
                      '{}: {} failed with {:d} - {}'
                      .format(method, url, status\_code, raw\_body)
                  )
              return response.json()
          except requests.exceptions.RequestException as e:
              print(e)
              raise e
  # Creates a contact. The server replies with a list of contacts and we
  # return the id of the first contact of the list
  def createContact(client, organizationId):
      contact = {
          'organizationId': organizationId,
          'name': 'John',
          'countryId': 'DK'
      }
      response = client.request('POST', '/contacts', {'contact': contact})
      return response\['contacts'\]\[0\]\['id'\]
  # Creates a product. The server replies with a list of products and we
  # return the id of the first product of the list
  def createProduct(client, organizationId):
      product = {
          'organizationId': organizationId,
          'name': 'Pens',
          'prices': \[{
              'unitPrice': 200,
              'currencyId': 'DKK'
          }\]
      }
      response = client.request('POST', '/products', {'product': product})
      return response\['products'\]\[0\]\['id'\]
  # Creates an invoice, the server replies with a list of invoices and we
  # return the id of the first invoice of the list
  def createInvoice(client, organizationId, contactId, productId):
      invoice = {
          'organizationId': organizationId,
          'invoiceNo': 65432,
          'entryDate': '2013-11-14',
          'contactId': contactId,
          'lines': \[{
              'productId': productId,
              'unitPrice': 200
          }\]
      }
      response = client.request('POST', '/invoices', {'invoice': invoice})
      return response\['invoices'\]\[0\]\['id'\]
  # Get id of organization associated with the API token.
  def getOrganizationId(client):
      response = client.request('GET', '/organization', None)
      return response\['organization'\]\['id'\]
  # Gets a invoice by its Id
  def get\_invoice(client, invoiceId):
      response = client.request('GET', '/invoices', invoiceId)
      return response\['invoices'\]\[0\]
  def main():
      client = BillyClient('INSERT ACCESS TOKEN HERE')
      currentOrganizationId = getOrganizationId(client)
      newContactId = createContact(client, currentOrganizationId)
      newProductId = createProduct(client, currentOrganizationId)
      newinvoiceId = createInvoice(client, currentOrganizationId, newContactId, newProductId)
      newlyCreatedInvoice = get\_invoice(client, newinvoiceId)
      print(newlyCreatedInvoice)
  main()

## Use case examples

### Posting a payment for an invoice

When you want to mark an invoice as paid, you have to create a [bank payment](#v2bankpayments) which matches the invoice's amount. Let's say you've just created an invoice with ID `inv-1234`, with a total amount due of $1,200. This is how you would create the payment:

`POST https://api.billysbilling.com/v2/bankPayments`

{
      "bankPayment": {
        "organizationId": "YOUR COMPANY ID",
        "entryDate": "2014-01-16",
        "cashAmount": 1200,
        "cashSide": "debit",
        "cashAccountId": "BANK ACCOUNT ID",
        "associations": \[
          {
            "subjectReference": "invoice:inv-1234"
          }
        \]
      }
    }

`cashAccountId` is the account that an amount of `cashAmount` was deposited to/withdrawn from. `cashSide: "debit"` means a deposit (used for invoices). `cashSide: "credit"` means a withdrawal (used for bills).

Each item in the `associations` array is a [balance modifier](#v2balancemodifiers). Since payments can pay different types of models (invoices, bills, etc.), you add the invoice to the payment by using a "reference," which is a type concatenated with a colon, concatenated with an ID; for example, `invoice:inv-1234`

The payment's currency is determined by the associations. This means that all associations must point to subjects in the same currency. That is, you can't pay a USD invoice together with an EUR invoice. This currency is called `subjectCurrency`, if you `GET` the bank payment later from the API. If the `subjectCurrency` is different from the currency of `cashAccount`, you also need to set a `cashExchangeRate`. In this example, we assume that the `cashAccount` is in USD.

After this call, our example invoice (for $1,200) will be paid, which will be visible through the invoice's `isPaid` property - which will be `true` - and its `balance` property, which will be `0.0`.

The `organizationId` is only necessary if you are using an access token that's tied to a user (rather than a company), or if you are using Basic Auth. You can list your user's companies through `GET /v2/user/organizations`.

### Posting a product with default price(s)

When `POST`ing to `/v2/products`, you can embed [product prices](#v2productprices) this way:

`POST https://api.billysbilling.com/v2/products`

{
      "product": {
        "organizationId": "YOUR ORGANIZATION ID",
        "name": "Bat capes",
        "accountId": "REVENUE ACCOUNT ID",
        "salesTaxRulesetId": "SALES TAX RULESET ID"
        "prices": \[
          {
            "unitPrice": 14000,
            "currencyId": "USD"
          },
          {
            "unitPrice": 10000,
            "currencyId": "EUR"
          }
        \]
      }
    }

The `organizationId` is only necessary if you are using an access token that's tied to a user (rather than a company), or if you are using Basic Auth. You can list your user's companies through `GET /v2/user/organizations`.

### Creating and using attachments

to upload files and automatically create attachments that can later be linked to invoices, bills, or daybook transactions. Attachments can include receipts, invoices, PDFs, or other supporting documents.

`POST https://api.billysbilling.com/v2/files`

    curl --location 'https://api.billy.dk/v2/files' 
      --header 'authorization: Bearer \*\*\*\*\*\*\*\*' 
      --header 'x-access-token: \*\*\*\*\*\*\*\*' 
      --header 'x-create-attachment: true'
      --header 'x-create-variants: true' 
      --header 'x-organizationid: <YOUR ORGANIZATION ID> 
      --header 'X-Filename: test.pdf' 
      --header 'Content-Type: application/pdf' 
      --data-binary '@/path/to/your/file.pdf'
    Shortened response example:
    {
      "files": \[
        {
          "id": "\*\*\*\*\*\*\*\*",
          "createdTime": "2025-11-12T04:37:46",
          "fileName": "test.pdf",
          "isPdf": true,
          "downloadUrl": "https://download.billy.dk/test.pdf?token=\*\*\*\*\*\*\*\*",
        }
      \],
      "attachments": \[
        {
          "id": "\*\*\*\*\*\*\*\*",
          "fileId": "\*\*\*\*\*\*\*\*"
        }
      \]
    }

If the uploaded document contains information that users might need to fill out manually (such as amounts or currency), include the following header to enable automatic data scanning and extraction: `x-should-scan: true`.

#### Linking attachments to resources

After creating an attachment, you can link it to an invoice, bill, or daybook transaction by including their Ids in the attachmentIds array of your request body.

    {
      "bill": {
        "attachmentIds": \[
        {
          "id": "<ATTACHMENT ID FROM UPLOAD>",
        },
        {
          "id": "<ATTACHMENT ID 2 FROM UPLOAD>",
        }
      \]
   }
}

### Sending emails for invoices

Send an email related to a specific invoice. Use this endpoint to send custom message to the contact persons linked to the invoice. The endpoint unfortunately does not support sending to multiple contact persons at once. The email addresses are taken from the contact person and if supplied the user.

`POST https://api.billysbilling.com/v2/invoices/:invoiceId/emails`

{
      "email": {
        "contactPersonId": "contactPersonId, required",
        "emailBody": "Your body here, required",
        "emailSubject": "Your subject here, required",
        "copyToUserId" => "userId, optional if you want to CC yourself",
      }
}

# Resource Documentation

Following is an extensive list of resources you can interact with.

In addition to the standard resources, there are also a number of "special" routes by which you can interact with the resources - for example, sending an invoice as an e-invoice. These are not yet documented.

## Table of Contents

*   [accountGroups](#v2accountgroups)
*   [accountNatures](#v2accountnatures)
*   [accounts](#v2accounts)
*   [attachments](#v2attachments)
*   [balanceModifiers](#v2balancemodifiers)
*   [bankLineMatches](#v2banklinematches)
*   [bankLines](#v2banklines)
*   [bankLineSubjectAssociations](#v2banklinesubjectassociations)
*   [bankPayments](#v2bankpayments)
*   [billLines](#v2billlines)
*   [bills](#v2bills)
*   [cities](#v2cities)
*   [contactBalancePayments](#v2contactbalancepayments)
*   [contactBalancePostings](#v2contactbalancepostings)
*   [contactPersons](#v2contactpersons)
*   [contacts](#v2contacts)
*   [countryGroups](#v2countrygroups)
*   [countries](#v2countries)
*   [currencies](#v2currencies)
*   [daybookBalanceAccounts](#v2daybookbalanceaccounts)
*   [daybooks](#v2daybooks)
*   [daybookTransactionLines](#v2daybooktransactionlines)
*   [daybookTransactions](#v2daybooktransactions)
*   [files](#v2files)
*   [invoiceLateFees](#v2invoicelatefees)
*   [invoiceLines](#v2invoicelines)
*   [invoiceReminderAssociations](#v2invoicereminderassociations)
*   [invoiceReminders](#v2invoicereminders)
*   [invoices](#v2invoices)
*   [locales](#v2locales)
*   [organizations](#v2organizations)
*   [postings](#v2postings)
*   [productPrices](#v2productprices)
*   [products](#v2products)
*   [salesTaxAccounts](#v2salestaxaccounts)
*   [salesTaxMetaFields](#v2salestaxmetafields)
*   [salesTaxPayments](#v2salestaxpayments)
*   [salesTaxReturns](#v2salestaxreturns)
*   [salesTaxRules](#v2salestaxrules)
*   [salesTaxRulesets](#v2salestaxrulesets)
*   [states](#v2states)
*   [taxRateDeductionComponents](#v2taxratedeductioncomponents)
*   [taxRates](#v2taxrates)
*   [transactions](#v2transactions)
*   [users](#v2users)
*   [zipcodes](#v2zipcodes)

## Resources

### `/v2/accountGroups`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `nature` | belongs-to | \- | immutable, required |
| `name` | string | \- | required |
| `description` | string | \- |   |

### `/v2/accountNatures`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `reportType` | enum | \- |   |
| `name` | string | \- |   |
| `normalBalance` | enum | \- |   |

### `/v2/accounts`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `name` | string | \- | required |
| `accountNo` | integer | \- |   |
| `description` | string | \- |   |
| `group` | belongs-to | \- | required |
| `nature` | belongs-to | \- | immutable, default: `unknown` |
| `systemRole` | enum | \- |   |
| `currency` | belongs-to | \- | immutable |
| `taxRate` | belongs-to | \- |   |
| `isPaymentEnabled` | boolean | \- |   |
| `isBankAccount` | boolean | \- | immutable |
| `isArchived` | boolean | \- |   |
| `bankName` | string | \- | readonly |
| `bankRoutingNo` | string | \- | readonly |
| `bankAccountNo` | string | \- | readonly |
| `bankSwift` | string | \- | readonly |
| `bankIban` | string | \- | readonly |

### `/v2/attachments`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `createdTime` | datetime | \- | readonly |
| `owner` | belongs-to-reference | \- | immutable, required |
| `file` | belongs-to | The ID of the file to attach. | immutable, required |
| `priority` | integer | \- |   |

### `/v2/balanceModifiers`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `modifier` | belongs-to-reference | \- | immutable, required |
| `subject` | belongs-to-reference | \- | immutable, required |
| `amount` | float | Balance modifier amount. | readonly |
| `entryDate` | date | Date of balance modifier entry | readonly |
| `realizedCurrencyDifference` | float | \- | readonly |
| `isVoided` | boolean | \- | readonly |

### `/v2/bankLineMatches`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `account` | belongs-to | The ID of the account to create the bank line match for. | immutable, required |
| `differenceType` | enum | If there is a difference, this value determines its type. | immutable |
| `feeAccount` | belongs-to | The ID of the account to add the bank fee to. | immutable, required |
| `entryDate` | date | \- | immutable |
| `amount` | float | \- | immutable |
| `side` | enum | \- | immutable |
| `isApproved` | boolean | Whether the bank lines and subjects are approved. |   |
| `approvedTime` | datetime | Time of approval. | readonly |
| `lines` | has-many | Lines for this bank line match. If this parameter is set, any existing lines for this bank line match will be deleted before adding the new ones. | readonly |
| `subjectAssociations` | has-many | Subject associations for the bank line match. If this parameter is set, any existing subject associations for this bank line match will be deleted before adding the new ones. | readonly |

### `/v2/bankLines`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `match` | belongs-to | \- | required |
| `account` | belongs-to | The ID of the account to create the bank line match for. | required |
| `entryDate` | date | \- | required |
| `description` | string | \- | required |
| `amount` | float | \- | required |
| `side` | enum | \- | required |

### `/v2/bankLineSubjectAssociations`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `match` | belongs-to | \- | required |
| `subject` | belongs-to-reference | The reference of the subject. | required |

### `/v2/bankPayments`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `contact` | belongs-to | The contact that all of the `associations`' subjects belong to. You can omit setting this property if you supply one or more records in `associations`. It will then default to the`contact` of the `associations`' subject. | immutable, required, default: `unknown` |
| `createdTime` | datetime | When the payment record was created in the system. | readonly |
| `entryDate` | date | The date of the transaction. | immutable, required |
| `cashAmount` | float | The amount that was deposited into or withdrawn from`cashAccount` in the account's currency. | immutable, required |
| `cashSide` | enum | Indicates whether the payment was a deposit (`debit`) or a withdrawal (`credit`). | immutable, required |
| `cashAccount` | belongs-to | The account that an amount was deposited into or withdrawn from. Must have `isPaymentEnabled` set to `true`. | immutable, required |
| `cashExchangeRate` | float | The exchange rate between subjectCurrency and`cashAccount`'s currency. 1 `subjectCurrency` =`cashExchangeRate` `cashAccountCurrency`. Must be set if `cashAccount`'s currency is different than`subjectCurrency`. Will be ignored and set to 1 if the currencies are the same. | immutable, required, default: `unknown` |
| `subjectCurrency` | belongs-to | The currency of what was paid. You can omit setting this property if you supply one or more records in `associations`. It will then default to the `currency` of the`associations`' subject. In case of an overpayment, the overpaid amount will be added to the contact's balance in this currency. | immutable, required, default: `unknown` |
| `feeAmount` | float | Used if the bank or payment provider charged the organization a fee for handling this payment. The fee amount must be positive, and will always be recorded as an expense (i.e., a debit posting on an expense account). `feeAmount` is in the same currency as`cashAccount`'s currency. The fee is always considered the organization's expense. This means that: - For deposits the subjects' balances will also be offset against the fee, as the customer shouldn't pay for the organization's payment expenses. Example: An invoice of `100 USD` will be paid in full by a`cashAmount` of `95` and a`feeAmount` of `5`. - For withdrawals the subject's balances will not be offset against the fee, as the supplier shouldn't pay for the organization's payment expenses. Example: A bill of `100 USD` will be paid in full by a`cashAmount` of `105` and a`feeAmount` of `5`. | immutable |
| `feeAccount` | belongs-to | The account to record the fee expense on. Must be an expense account. Must be set if `feeAmount` is set. | immutable, required |
| `isVoided` | boolean | Indicates if the payment has been canceled. You must leave this field blank or set to `false` for new payments. Once a payment has been canceled by setting this field to `true` it can't be reinstated ("un-canceled"). |   |
| `associations` | has-many | The subjects this payment involves. The subjects' outstanding`balance` and `isPaid` properties will automatically be updated by the API. | immutable |
| `contactBalancePostings` | has-many | \- | readonly |

### `/v2/billLines`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `bill` | belongs-to | \- | immutable, required |
| `account` | belongs-to | \- | required |
| `taxRate` | belongs-to | \- | required |
| `description` | string | \- | required |
| `amount` | float | \- | required |
| `tax` | float | \- | readonly |
| `priority` | integer | \- |   |

### `/v2/bills`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `type` | enum | \- | immutable |
| `createdTime` | datetime | \- | readonly |
| `approvedTime` | datetime | \- | readonly |
| `contact` | belongs-to | \- | immutable, required |
| `contactName` | string | \- |   |
| `entryDate` | date | \- | required |
| `paymentAccount` | belongs-to | \- | immutable |
| `paymentDate` | date | \- | immutable, required |
| `dueDate` | date | \- |   |
| `isBare` | boolean | \- |   |
| `state` | enum | \- | default: `"draft"` |
| `suppliersInvoiceNo` | string | \- |   |
| `taxMode` | enum | Whether unit prices are treated as including (incl) or excluding (excl) VAT. If not set, defaults to the organisation's defaultTaxMode. Example: with a unit price of 100 and a 25% VAT rate, `incl` means the line totals 100 (80 net + 20 VAT), while `excl` means the line totals 125 (100 net + 25 VAT). |   |
| `voucherNo` | string | Voucher number for the bill |   |
| `amount` | float | \- | readonly |
| `tax` | float | \- | readonly |
| `currency` | belongs-to | \- |   |
| `exchangeRate` | float | \- |   |
| `balance` | float | \- | readonly |
| `isPaid` | boolean | \- | readonly |
| `lineDescription` | string | \- | readonly |
| `creditedBill` | belongs-to | \- | immutable |
| `creditNotes` | has-many | \- | readonly |
| `lines` | has-many | \- |   |
| `attachments` | has-many | \- |   |
| `balanceModifiers` | has-many | Payment associations for the bill. | readonly |
| `source` | string | Source of the bill. | readonly |
| `subject` | string | Original subject of the bill. | readonly |

#### `List filters`

Supports filtering by following parameters

| Parameter | Type | Description |
| --- | --- | --- |
| sortProperty | string | Sort by one of: entryDate, dueDate, createdTime, lineDescription, amount, grossAmount, balance, contact.name, voucherNo, suppliersInvoiceNo, attachments |
| sortDirection | string (Enum: "ASC", "DESC") | Sort ascending (ASC) or descending (DESC) |
| organizationId | string | Filter by organizationId belonging to a specific Organization |
| contactId | string | Filter by contactId belonging to a specific Contact |
| creditedBillId | string | Filter by creditedBillId belonging to a specific Bill |
| minEntryDate | string (date) | Filter by entryDate ≥ a specified value |
| maxEntryDate | string (date) | Filter by entryDate ≤ a specified value |
| minDueDate | string (date) | Filter by dueDate ≥ a specified value |
| maxDueDate | string (date) | Filter by dueDate ≤ a specified value |
| isPaid | boolean | Filter by isPaid |
| hasAttachments | boolean | Filter by bills that have attachments |
| state | string (Enum: "draft", "approved", "voided") | Filter by state |
| currencyId | string | Filter by currencyId belonging to a specific Currency |
| suppliersInvoiceNo | string | Filter by suppliersInvoiceNo |
| isBare | boolean | Filter by isBare |
| amount | number (float) | Filter by amount |
| q | string | Search by: contact.name, lineDescription, voucherNo, amount, suppliersInvoiceNo, balance |

### `/v2/cities`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `name` | string | \- |   |
| `county` | string | \- |   |
| `state` | belongs-to | \- |   |
| `country` | belongs-to | \- |   |

### `/v2/contactBalancePayments`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `contact` | belongs-to | Automatically set by the API. The contact that all of the`associations`' subjects belong to. | immutable, required, default: `unknown` |
| `createdTime` | datetime | \- | readonly |
| `entryDate` | date | The date that this transaction occurred accounting-wise. | immutable, required |
| `amount` | float | The amount to apply to the subject(s) balance. | immutable, required |
| `side` | enum | Automatically set by the API. Indicates: - `debit`: The payment used a prepayment that a customer made to the company. -`credit`: The payment used a prepayment that the company made to a vendor. | immutable, required, default: `unknown` |
| `currency` | belongs-to | Automatically set by the API to the currency of the subject(s). | immutable, required, default: `unknown` |
| `isVoided` | boolean | \- |   |
| `associations` | has-many | The subjects this payment involves. The subjects' outstanding`balance` and `isPaid` properties will automatically be updated by the API. | immutable, required |

### `/v2/contactBalancePostings`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `contact` | belongs-to | \- | readonly |
| `originator` | belongs-to-reference | \- | readonly |
| `createdTime` | datetime | \- | readonly |
| `entryDate` | date | \- | readonly |
| `amount` | float | \- | readonly |
| `side` | enum | \- | readonly |
| `currency` | belongs-to | \- | readonly |
| `isVoided` | boolean | \- | readonly |

### `/v2/contactPersons`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `contact` | belongs-to | \- | immutable, required |
| `isPrimary` | boolean | If contact person is primary for the parent contact. |   |
| `name` | string | The name of the contact person. Either name or email must be set. | required |
| `email` | string | The contact person's e-mail. Used to mail invoices to the contact. Either name or email must be set. |   |

### `/v2/contacts`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `type` | enum | Whether contact is a `company` or an `person`. Defaults to `company` | required, default: `"company"` |
| `organization` | belongs-to | \- | immutable, required |
| `createdTime` | datetime | \- | readonly |
| `name` | string | The name of the contact. Can be either a company name or a person's name. | required |
| `country` | belongs-to | The contact's home/business country. | required |
| `street` | string | The contact's street address. |   |
| `city` | belongs-to | The contact's city, if finite. |   |
| `cityText` | string | The contact's city, in text form. |   |
| `state` | belongs-to | The name of the contact's state, if finite. |   |
| `stateText` | string | The name of the contact's state, in text form. |   |
| `zipcode` | belongs-to | The contact's zipcode, if finite. |   |
| `zipcodeText` | string | The contact's zipcode, in text form. |   |
| `contactNo` | string | Arbitrary number (or string) that contacts can be referred to by. |   |
| `phone` | string | The contact's phone number. |   |
| `fax` | string | The contact's fax number. |   |
| `currency` | belongs-to | Default currency to use for invoices created for the contact. Has no effect in the API, as currency for invoice always is required. |   |
| `registrationNo` | string | The contact's EU VAT number, CVR number in Denmark, tax ID (TIN/EIN/SSN) in the US. |   |
| `ean` | string | The contact's EAN (European Article Number). |   |
| `locale` | belongs-to | Language to use in communications with the contact. The language also decides which language should be used on invoices created for the contact. |   |
| `isCustomer` | boolean | Whether the contact is regarded as a customer and can have invoices, etc. |   |
| `isSupplier` | boolean | Whether the contact is regarded as a vendor and can have bills etc. |   |
| `paymentTermsMode` | enum | \- |   |
| `paymentTermsDays` | integer | \- | required |
| `contactPersons` | has-many | You can add one or more contact persons for the contact. If this parameter is set, any existing contact persons for this contact will be deleted before adding the new ones. |   |
| `accessCode` | string | Used to generate the contact's customer portal URL. |   |
| `emailAttachmentDeliveryMode` | enum | Whether to deliver attachments by link to customer portal or with email attachments. |   |
| `isArchived` | boolean | Whether the contact is archived. |   |

### `/v2/countryGroups`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `name` | string | \- |   |
| `icon` | string | \- |   |
| `memberCountryIds` | string | \- |   |

### `/v2/countries`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `name` | string | \- |   |
| `hasStates` | boolean | \- |   |
| `hasFiniteStates` | boolean | \- |   |
| `hasFiniteZipcodes` | boolean | \- |   |
| `icon` | string | \- |   |
| `locale` | belongs-to | \- |   |

### `/v2/currencies`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `name` | string | \- |   |
| `exchangeRate` | float | \- |   |

### `/v2/daybookBalanceAccounts`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `daybook` | belongs-to | \- | required |
| `account` | belongs-to | \- | required |
| `priority` | integer | \- | required |

### `/v2/daybooks`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `isTransactionSummaryEnabled` | boolean | \- | required |
| `name` | string | The name of the daybook. | required |
| `defaultContraAccount` | belongs-to | \- |   |
| `balanceAccounts` | has-many | Balance accounts to monitor. |   |

### `/v2/daybookTransactionLines`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `daybookTransaction` | belongs-to | \- | immutable, required |
| `text` | string | Line description. |   |
| `account` | belongs-to | @id@ of account line is to be applied to. Either @accountId@ or @accountNo@ must be filled in. | immutable, required |
| `taxRate` | belongs-to | \- | immutable |
| `contraAccount` | belongs-to | @id@ of account line is to be applied against. | immutable |
| `amount` | float | Amount of line. | immutable, required |
| `side` | enum | "debit" or "credit" | immutable, required |
| `currency` | belongs-to | \- | immutable, default: `unknown` |
| `priority` | integer | \- |   |

### `/v2/daybookTransactions`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `daybook` | belongs-to | \- |   |
| `createdTime` | datetime | \- | readonly |
| `entryDate` | date | The transaction entry date in YYYY-MM-DD format. | immutable, required |
| `voucherNo` | string | A number or a string that identifies this transaction's voucher number, e.g. a bill. |   |
| `description` | string | Description of transaction. |   |
| `extendedDescription` | string | Extended/verbose description of transaction. |   |
| `apiType` | string | Method used to make the API call. This is for your notation only. |   |
| `state` | enum | \- | default: `"draft"` |
| `priority` | integer | \- |   |
| `lines` | has-many | Lines for the transaction. At minimum one line must be supplied. | immutable |
| `attachments` | has-many | Attachments for the daybook transaction. | immutable |

#### `List filters`

Supports filtering by following parameters

| Parameter | Type | Description |
| --- | --- | --- |
| sortProperty | string | Sort by one of: priority, entryDate, createdTime |
| sortDirection | string (Enum: "ASC", "DESC") | Sort ascending (ASC) or descending (DESC) |
| organizationId | string | Filter by organizationId belonging to a specific Organization |
| daybookId | string | Filter by daybookId belonging to a specific Daybook |
| apiType | string | Filter by apiType |
| state | string (Enum: "draft", "approved", "voided") | Filter by state |
| minEntryDate | string (date) | Filter by entryDate ≥ a specified value |
| maxEntryDate | string (date) | Filter by entryDate ≤ a specified value |
| q | string | Search by: description, extendedDescription, voucherNo |

### `/v2/files`

Supports: get by id, list, create, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `createdTime` | datetime | \- | readonly |
| `fileName` | string | \- | readonly |
| `fileSize` | integer | \- | readonly |
| `fileType` | string | \- | readonly |
| `isImage` | boolean | \- | readonly |
| `isPdf` | boolean | \- | readonly |
| `imageWidth` | integer | \- | readonly |
| `imageHeight` | integer | \- | readonly |
| `downloadUrl` | string | \- | readonly |

### `/v2/invoiceLateFees`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `invoice` | belongs-to | \- | immutable, required |
| `createdTime` | datetime | \- | readonly |
| `entryDate` | date | \- | immutable, required |
| `flatFee` | float | \- | immutable, required |
| `percentageFee` | float | \- | immutable, required |
| `amount` | float | \- | readonly |
| `isVoided` | boolean | \- |   |

### `/v2/invoiceLines`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `invoice` | belongs-to | \- | immutable, required |
| `product` | belongs-to | The product to use for the line. | required |
| `description` | string | Optional description to display under the product's name on the invoice. |   |
| `quantity` | float | The line's quantity. | default: 1 |
| `unitPrice` | float | The price per unit of the product. | required |
| `amount` | float | \- | readonly |
| `tax` | float | \- | readonly |
| `taxRate` | belongs-to | \- | readonly |
| `discountText` | string | Text to display if the line includes a discount. |   |
| `discountMode` | enum | How the discount should be calculated. Cash discount: The value of @discountValue@ will be subtracted from the line's amount. Percentage discount: The percentage value of @discountValue@ will be subtracted from the line's amount. |   |
| `discountValue` | float | Depending on @discountMode@, either an amount or a percentage value. Percentage value should be supplied as e.g. 25 for 25%. Required if @discountValue@ is set. ignored if @discountValue@ is not set. |   |
| `priority` | integer | \- |   |

### `/v2/invoiceReminderAssociations`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `reminder` | belongs-to | \- | required |
| `invoice` | belongs-to | \- | required |
| `lateFee` | belongs-to | \- | readonly |

### `/v2/invoiceReminders`

Supports: get by id, list, create, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `contact` | belongs-to | \- | required |
| `createdTime` | datetime | \- | readonly |
| `associations` | has-many | \- |   |
| `flatFee` | float | \- |   |
| `percentageFee` | float | \- |   |
| `feeCurrency` | belongs-to | \- | required |
| `sendEmail` | boolean | \- |   |
| `contactPerson` | belongs-to | \- | required |
| `emailSubject` | string | \- | required |
| `emailBody` | string | \- | required |
| `copyToUser` | belongs-to | \- |   |
| `downloadUrl` | string | \- |   |

### `/v2/invoices`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `type` | enum | Whether to create an invoice or a credit note. Defaults to @invoice@. | immutable |
| `createdTime` | datetime | \- | readonly |
| `approvedTime` | datetime | \- | readonly |
| `contact` | belongs-to | The ID of the contact to create the invoice for. | immutable, required |
| `attContactPerson` | belongs-to | ID for a contact person belonging to the contact that should be included as Att: in the invoice address area. |   |
| `entryDate` | date | The invoice date. This parameter must not be set if the invoice has already been created. | required |
| `paymentTermsMode` | enum | \- | default: `unknown` |
| `paymentTermsDays` | integer | Number of days (positive or negative) for the mode defined by`paymentTermsMode` | required |
| `dueDate` | date | The due date for payment of the invoice. | readonly |
| `state` | enum | Used to change the state of the invoice. Currently the only state change possible is from draft to approved. Once an invoice has been approved, its state can't be changed. Omit from request body if state shouldn't be changed. | required, default: `"draft"` |
| `sentState` | enum | Sent state of the email. Invoice is marked as `unsent` by default, can be marked as `printed`, `sent`,`opened`, `viewed`. | required, default: `"unsent"` |
| `invoiceNo` | string | Manually set the invoice number. Invoice numbers has to be unique. If no invoice number is set when the invoice is created, it will automatically be assigned a number using the company's invoice number model. This parameter must not be set if the invoice has already been created. | immutable, required |
| `taxMode` | enum | Whether unit prices are treated as including (incl) or excluding (excl) VAT. If not set, defaults to the organisation's defaultTaxMode. Example: with a unit price of 100 and a 25% VAT rate, `incl` means the line totals 100 (80 net + 20 VAT), while `excl` means the line totals 125 (100 net + 25 VAT). |   |
| `amount` | float | \- | readonly |
| `tax` | float | \- | readonly |
| `currency` | belongs-to | The currency of the invoice. All lines' @unitPrice@ parameters should be in this currency. | required, default: `unknown` |
| `exchangeRate` | float | The exchange rate used for invoices in foreign currencies. The value should calculated like this: bq. @exchangeRate@ = @currency@ / @organization's base currency@ If this field is left blank, then today's exchange rate will automatically be used. If @currencyId@ equals the organization's base currency, the value of this field is ignored - it will always be 1. |   |
| `balance` | float | \- | readonly |
| `isPaid` | boolean | \- | readonly |
| `creditedInvoice` | belongs-to | \- | immutable |
| `contactMessage` | string | Optional message to the contact, to be displayed at the top of the invoice PDF. |   |
| `lineDescription` | string | Automatically generated based on its lines' descriptions. |   |
| `downloadUrl` | string | \- |   |
| `lines` | has-many | Lines for the invoice. At minimum, one line must be supplied. If this parameter is set, any existing lines for this invoice will be deleted before adding the new ones. This parameter must not be set if the invoice has already been created. | required |
| `attachments` | has-many | Attachments for the invoice. |   |
| `lateFees` | has-many | \- | readonly |
| `balanceModifiers` | has-many | Payment associations for the invoice. | readonly |

#### `List filters`

Supports filtering by following parameters

| Property | Type | Description |
| --- | --- | --- |
| sortProperty | string | Enum: "entryDate" "dueDate" "createdTime" "invoiceNo" "lineDescription" "amount" "grossAmount" "balance" "contact.name" "approvedTime" "orderNo"  
Sort by one of the following properties:`entryDate`, `dueDate`,`createdTime`, `invoiceNo`,`lineDescription`, `amount`,`grossAmount`, `balance`,`contact.name`, `approvedTime`,`orderNo` |
| sortDirection | string | Enum: "ASC" "DESC"  
Sort ascending (`ASC`) or descending (`DESC`) |
| organizationId | string | Filter by organizationId belonging to a specific Organization |
| contactId | string | Filter by contactId belonging to a specific Contact |
| creditedInvoiceId | string | Filter by creditedInvoiceId belonging to a specific Invoice |
| state | string | Enum: "draft" "approved" "voided"  
Filter by `state` |
| invoiceNo | string | Filter by `invoiceNo` |
| externalId | string | Filter by `externalId` |
| minEntryDate | string <date> | Example: minEntryDate=2025-06-02  
Filter by `entryDate` greater than or equal to a specified value |
| maxEntryDate | string <date> | Example: maxEntryDate=2025-06-23  
Filter by `entryDate` less than or equal to a specified value |
| entryDatePeriod | string | Examples:
*   `entryDatePeriod=all`
*   `entryDatePeriod=dates:2025-06-23...2025-06-24`
*   `entryDatePeriod=day:2025-06-08`
*   `entryDatePeriod=halfYear:2025-2`
*   `entryDatePeriod=month:2025-06`
*   `entryDatePeriod=quarter:2025-2`
*   `entryDatePeriod=year:2025`
*   `entryDatePeriod=fiscalYear:2025`

Filter by `entryDatePeriod` matching the specified date period |
| minApprovedTime | string <date-time> | Example: minApprovedTime=2025-06-02 12:00:00  
Filter by `approvedTime` greater than or equal to a specified value |
| maxApprovedTime | string <date-time> | Example: maxApprovedTime=2025-06-02 12:00:00  
Filter by `approvedTime` less than or equal to a specified value |
| approvedTimePeriod | string | Examples:

*   `approvedTimePeriod=all`
*   `approvedTimePeriod=dates:2025-04-23...2025-06-14`
*   `approvedTimePeriod=from:2025-05-08`
*   `approvedTimePeriod=half:2025-2`
*   `approvedTimePeriod=month:2025-06`
*   `approvedTimePeriod=quarter:2025-2`
*   `approvedTimePeriod=through:2025-05-03`
*   `approvedTimePeriod=year:2025`
*   `approvedTimePeriod=fiscalYear:2025`

Filter by `approvedTimePeriod` matching the specified date period |
| minDueDate | string <date> | Example: minDueDate=2025-06-02  
Filter by `dueDate` greater than or equal to a specified value |
| maxDueDate | string <date> | Example: maxDueDate=2025-06-02  
Filter by `dueDate` less than or equal to a specified value |
| isPaid | boolean | Filter by `isPaid` |
| currencyId | string | Example: currencyId=f0f111m0gayd9p4kk41s2f0a  
Filter by `currencyId` belonging to a specific`Currency` |
| recurringInvoiceId | string | Filter by `recurringInvoiceId` |
| amount | number <float> | Example: amount=12.5  
Filter by `amount` |
| quoteId | string | Filter by `quoteId` |
| q | string | Search by the following properties: `invoiceNo`,`orderNo`, `contact.name`,`lineDescription`, `amount`,`amount + tax`, `balance` |

### `/v2/locales`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `name` | string | \- |   |
| `icon` | string | \- |   |

### `/v2/organizations`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `ownerUser` | belongs-to | \- | required |
| `createdTime` | datetime | When the organization was created | readonly |
| `name` | string | \- | required |
| `url` | string | \- | readonly |
| `street` | string | \- |   |
| `zipcode` | string | \- |   |
| `city` | string | \- |   |
| `country` | belongs-to | \- | immutable, required |
| `phone` | string | \- |   |
| `fax` | string | \- |   |
| `email` | string | \- |   |
| `registrationNo` | string | \- |   |
| `baseCurrency` | belongs-to | \- | immutable, required |
| `logoFile` | belongs-to | Organization logo. |   |
| `logoPdfFile` | belongs-to | Logo file to be used with PDFs. | readonly |
| `logoUrl` | string | Full-size logo URL | readonly |
| `iconFile` | belongs-to | Organization icon. |   |
| `iconUrl` | string | Full-size icon URL | readonly |
| `icon48Url` | string | 48x48 pixels icon URL | readonly |
| `fiscalYearEndMonth` | integer | \- | required |
| `firstFiscalYearStart` | date | \- | required |
| `firstFiscalYearEnd` | date | \- | required |
| `hasBillVoucherNo` | boolean | Whether or not the company has a bill voucher number |   |
| `subscriptionCardType` | string | \- |   |
| `subscriptionCardNumber` | string | \- |   |
| `subscriptionCardExpires` | date | \- |   |
| `subscriptionTransaction` | belongs-to | The transaction for the company's recurring subscription. |   |
| `isSubscriptionBankPayer` | boolean | \- |   |
| `subscriptionPrice` | float | \- |   |
| `subscriptionPeriod` | enum | \- | required, default: `"monthly"` |
| `subscriptionDiscount` | float | \- | readonly |
| `subscriptionExpires` | date | \- |   |
| `isTrial` | boolean | \- | readonly |
| `isTerminated` | boolean | \- |   |
| `terminationTime` | datetime | When the company was terminated | readonly |
| `locale` | belongs-to | The organization's default language. Will be used for all contacts unless overridden on a contact level. | required |
| `billEmailAddress` | string | An email can be sent to this address and its attachments will be processed into bills | readonly |
| `isUnmigrated` | boolean | If this is true, the company has not yet migrated to our new system. | readonly |
| `isLocked` | boolean | If this is true, the company is locked. | readonly |
| `lockedCode` | enum | \- | readonly |
| `lockedReason` | string | Reason the company is currently locked. | readonly |
| `appUrl` | string | \- | readonly |
| `emailAttachmentDeliveryMode` | enum | Whether to deliver attachments by link to customer portal, or with email attachments. | required |
| `hasVat` | boolean | \- |   |
| `vatPeriod` | enum | \- | required |
| `defaultInvoiceBankAccount` | belongs-to | \- |   |
| `invoiceNoMode` | enum | \- | required |
| `nextInvoiceNo` | integer | \- | required |
| `paymentTermsMode` | enum | \- | required |
| `paymentTermsDays` | integer | \- | required |
| `defaultTaxMode` | enum | The organisation's default tax inclusivity mode (incl or excl). Used as the fallback for taxMode on newly created invoices and bills when not explicitly set in the request. Example: with a unit price of 100 and a 25% VAT rate, `incl` means the line totals 100 (80 net + 20 VAT), while `excl` means the line totals 125 (100 net + 25 VAT). |   |
| `defaultSalesAccount` | belongs-to | \- |   |
| `defaultSalesTaxRuleset` | belongs-to | \- |   |
| `bankSyncStartDate` | date | \- |   |
| `defaultBankFeeAccount` | belongs-to | \- |   |
| `defaultBillBankAccount` | belongs-to | \- |   |

### `/v2/postings`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `transaction` | belongs-to | \- | readonly |
| `entryDate` | date | \- | readonly |
| `text` | string | \- | readonly |
| `account` | belongs-to | \- | readonly |
| `amount` | float | \- | readonly |
| `side` | enum | \- | readonly |
| `currency` | belongs-to | \- | readonly |
| `salesTaxReturn` | belongs-to | \- | readonly |
| `isVoided` | boolean | \- | readonly |
| `isBankMatched` | boolean | \- | readonly |
| `priority` | integer | \- | readonly |

### `/v2/productPrices`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `product` | belongs-to | \- | immutable, required |
| `unitPrice` | float | Currency for the unit price. | required |
| `currency` | belongs-to | The default unit price for invoice lines when the invoice's currency matches this currency. | required |

### `/v2/products`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `name` | string | The name of the product. | required |
| `description` | string | Optional description that will be used as default on invoice lines with this product. |   |
| `account` | belongs-to | The account that sales of the product should be coded to. | required, default: `unknown` |
| `productNo` | string | A number (or string) that the organization identifies the product by. |   |
| `suppliersProductNo` | string | A number (or string) that the organization's supplier identifies the product by. |   |
| `salesTaxRuleset` | belongs-to | \- | default: `unknown` |
| `isArchived` | boolean | \- |   |
| `prices` | has-many | The product can have a unit price for each of the organization's currencies. |   |

### `/v2/salesTaxAccounts`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `account` | belongs-to | \- | required |
| `type` | enum | \- | required |
| `priority` | integer | \- |   |

### `/v2/salesTaxMetaFields`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `name` | string | \- | required |
| `description` | string | \- |   |
| `priority` | integer | \- |   |
| `isPredefined` | boolean | \- |   |

### `/v2/salesTaxPayments`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `salesTaxReturn` | belongs-to | \- | immutable, required |
| `entryDate` | date | \- | immutable, required |
| `account` | belongs-to | \- | immutable, required |
| `amount` | float | \- | readonly |
| `side` | enum | \- | readonly |
| `isVoided` | boolean | \- |   |

### `/v2/salesTaxReturns`

Supports: get by id, list, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | readonly |
| `createdTime` | datetime | \- | readonly |
| `periodType` | enum | \- | readonly |
| `period` | string | \- | readonly |
| `periodText` | string | \- |   |
| `correctionNo` | integer | \- | readonly |
| `startDate` | date | \- | readonly |
| `endDate` | date | \- | readonly |
| `reportDeadline` | date | \- |   |
| `isSettled` | boolean | \- |   |
| `isPaid` | boolean | \- | readonly |

### `/v2/salesTaxRules`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `ruleset` | belongs-to | \- | immutable, required |
| `country` | belongs-to | \- | immutable, required |
| `state` | belongs-to | \- | immutable |
| `countryGroup` | belongs-to | \- | immutable |
| `contactType` | enum | \- | immutable |
| `taxRate` | belongs-to | \- | immutable |
| `priority` | integer | \- | immutable |

### `/v2/salesTaxRulesets`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `name` | string | \- | immutable, required |
| `abbreviation` | string | \- | immutable |
| `description` | string | \- | immutable |
| `fallbackTaxRate` | belongs-to | \- | immutable |
| `isPredefined` | boolean | \- | readonly |
| `rules` | has-many | \- | immutable |

### `/v2/states`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `stateCode` | string | \- |   |
| `name` | string | \- |   |
| `country` | belongs-to | \- |   |

### `/v2/taxRateDeductionComponents`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `taxRate` | belongs-to | \- | immutable, required |
| `share` | float | \- | immutable, required |
| `source` | enum | \- | immutable, required |
| `account` | belongs-to | \- | immutable, required |
| `priority` | integer | \- |   |

### `/v2/taxRates`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `name` | string | \- | immutable, required |
| `abbreviation` | string | \- | immutable |
| `description` | string | \- | immutable |
| `rate` | float | \- | immutable, required |
| `appliesToSales` | boolean | \- | immutable |
| `appliesToPurchases` | boolean | \- | immutable |
| `isPredefined` | boolean | \- | readonly |
| `isActive` | boolean | \- |   |
| `netAmountMetaField` | belongs-to | \- | immutable |
| `deductionComponents` | has-many | \- | immutable |

### `/v2/transactions`

Supports: get by id, list, create, update, bulk save, delete, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `organization` | belongs-to | \- | immutable, required |
| `transactionNo` | integer | \- | readonly |
| `voucherNo` | string | \- | readonly |
| `createdTime` | datetime | \- | readonly |
| `entryDate` | date | \- | readonly |
| `originator` | belongs-to-reference | \- | readonly |
| `originatorName` | string | \- | readonly |
| `isVoided` | boolean | \- | readonly |
| `isVoid` | boolean | \- | readonly |
| `postings` | has-many | \- | readonly |

### `/v2/users`

Supports: get by id, list, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `createdTime` | datetime | Date/time user was created | readonly |
| `name` | string | User's full name. | required |
| `email` | string | User's email address. | required |
| `phone` | string | User's phone number. |   |
| `profilePicFile` | belongs-to | Profile picture of user. | readonly |
| `profilePicUrl` | string | \- | readonly |
| `profilePic48Url` | string | \- | readonly |
| `isStaff` | boolean | Whether or not the user is a member of the Billy staff. |   |
| `isSupporter` | boolean | Whether or not the user is a Billy supporter. |   |
| `isAdmin` | boolean | Whether or not the user is a Billy admin. |   |
| `isSupportAccessAllowed` | boolean | Whether or not the user chooses to allow supporter access. |   |

### `/v2/zipcodes`

Supports: get by id, list, create, update, bulk save, bulk delete

| Property | Type | Description | Notes |
| --- | --- | --- | --- |
| `zipcode` | string | \- |   |
| `city` | belongs-to | \- |   |
| `state` | belongs-to | \- |   |
| `country` | belongs-to | \- |   |
| `latitude` | float | \- |   |
| `longitude` | float | \- |   |

[![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27120%27%20height=%2740%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/assets/new_identity/logos/billy-by-shine_white.svg)

](/)Fiolstræde 17B  
1171 København KCVR-nr. 33239106

![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%2714%27%20height=%2714%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/assets/new_identity/icons/phone-white.svg)

[89 87 87 00](tel:+4589878700/)

![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%2714%27%20height=%2714%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/assets/new_identity/icons/envelope-white.svg)

[billy@billy.dk](mailto:billy@billy.dk)

[![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%2728%27%20height=%2728%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/assets/new_identity/social-media/facebook-white-circle.svg)

](https://www.facebook.com/billybyshine)[![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%2728%27%20height=%2728%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/assets/new_identity/social-media/linkedin-white-circle.svg)

](https://linkedin.com/company/billybyshine)

##### Om os

[Historie](/om-billy/)[Kontakt](/support/)[Jobs](https://careers.shine.co/)

##### Revisor

[Find selv revisor](/revisor/find-selv-revisor/)[For revisorer](/revisor/funktion/for-revisorer/)

##### Samarbejde

[Integrationer](/apps/)[For udviklere](/api/)[Affiliate partner](/affiliate-partner/)

##### Links

[Forretningsbetingelser](https://shine.co/dk/legal/terms)[Privatlivspolitik](https://shine.co/dk/legal/privacy)[Cookiepolitik](https://shine.co/dk/legal/cookies)[Databehandleraftale](https://shine.co/dk/legal/dpa)[Finanstilsynet rapport](/finanstilsynet-rapport/)[Billypedia](/billypedia/)[Blog](/blog/)[Sammenligning af regnskabsprogrammer](/sammenlign/)

![](data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27380.79999999999995%27%20height=%2726.599999999999998%27/%3e)![](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

![](/_next/image/?url=%2Fassets%2Fnext%2Fimages%2Flogos%2Fmisc%2Fisae3000_2023_white.png&w=828&q=75)

© 2026 Billy