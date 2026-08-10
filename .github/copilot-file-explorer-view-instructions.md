## root level for tree view
Cartridge List (Cartridge bir proje paketi. Bir Folder gibi, içinde farklı component ve flowlar olacak onunu structurunı vereceğim.)



Cartrdige Concept
What Are Cartridges?
In cartridges are the building blocks and deployment containers
of an -based application. Cartridges can be installed (deployed) on
a server in order to make the functionality implemented by the
application units available on the server.
The term cartridge refers to software modules that encapsulate various code
artifacts. See Cartridge Components for detailed information about these code
artifacts.
Thus, cartridges are the standard mechanism for packaging and deploying
applications.
Any objects and entities defined at the different architectural layers (persistence
layer, business object layer, presentation layer) are distributed over a set of
cartridges.
The cartridge concept provides a uniform and easy-to-handle way of integrating
new code components into . All new applications to extend and/
or customize must abide by the organizational principles that the
cartridge concept imposes, no matter whether the application is simple or complex.

Cartridge Components
A cartridge bundles all components that are necessary for adding business logic
into one portable and easy-to-isolate package. Cartridges specifically contain the
following code artifacts:
• Templates
• Pagelets
• Pipelets
• Pipelines (Pipeline ı extend ettiğimde treeview da startr node ları listelensin.)
• Localization ressources
• Queries
• Webforms
• Web services
• Images and static HTML files
• Descriptive and version information, and other resource files


cartridge/model
cartridge/components
cartridge/config
cartridge/docs
cartridge/extensions
cartridge/localizations
cartridge/pagelets
cartridge/pipelines
cartridge/queries
cartridge/static
cartridge/federation
cartridge/urlrewrite
cartridge/webforms
cartridge/endpoints
cartridge/ai