# Support for Optionally separating custom parser in atrrConfig

As mentioned multiple times in the README.md and elsewhere, the desire is for as much as possible of the EnhancementConfig to either be JSON serializable, or easily imported as part of the references number, or via some other mechanism (like registering names somewhere)?

I'd like to future out the approach to be able to import the customParser of AttrConfig, so it can belong to an export js file, or named somewhere.